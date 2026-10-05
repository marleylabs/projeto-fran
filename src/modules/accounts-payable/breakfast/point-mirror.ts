// Espelho de Ponto → sugestão de "Quantidade Extras" do Café da Manhã. Funções puras (sem Prisma):
// o backend lê o arquivo em memória, aplica estas regras e só devolve agregados (CPF mascarado).
//
// Regra: +1 extra por DATA (colaborador + data, deduplicado) em que o colaborador trabalhou em
//   sábado OU domingo OU feriado  (Natureza Dia = "Feriado"),
//   E Horas Trabalhadas > 00:00,
//   E Jornada Considerada ≠ "Trabalho Esperado".
// Sábado/domingo vêm da coluna Data (fonte principal); a coluna Dia só serve de conferência (warning).
// O resultado é apenas uma SUGESTÃO: o usuário aplica explicitamente e continua podendo editar.
import { isValidCpf, maskCpf, normalizeCpf } from "@/lib/cpf";
import { findHeader, normalizeCell, normalizeHeader } from "@/modules/accounts-payable/shared/spreadsheet";

export const POINT_MIRROR_REQUIRED_HEADERS = ["Nome", "CPF", "Data", "Dia", "Natureza Dia", "Jornada Considerada", "Horas Trabalhadas"] as const;
export const MAX_POINT_MIRROR_FILE_SIZE = 10 * 1024 * 1024;
export class PointMirrorError extends Error {}

const comparable = (value: unknown) => normalizeHeader(value); // trim + minúsculas + sem acento
const EXPECTED_WORK = comparable("Trabalho Esperado");
const HOLIDAY = comparable("Feriado");

// "HH:mm" → minutos (00:00 → 0, 08:48 → 528). Aceita Date de célula XLSX de hora. Inválido → null.
export function parseWorkedMinutes(value: unknown): number | null {
  if (value instanceof Date) return value.getUTCHours() * 60 + value.getUTCMinutes();
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(normalizeCell(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// "dd/MM/yyyy" (ou Date de célula XLSX) → "yyyy-MM-dd" validando a data real.
export function parsePointMirrorDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalizeCell(value));
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

// CPF do ponto: só dígitos e, se a exportação perdeu zeros à esquerda (1–10 dígitos), completa até 11.
export function normalizePointMirrorCpf(value: unknown): string | null {
  const digits = normalizeCpf(value);
  if (!digits || digits.length > 11) return null;
  const padded = digits.padStart(11, "0");
  return isValidCpf(padded) ? padded : null;
}

export type PointMirrorRow = { sourceRow: number; name: string; cpf: string | null; rawCpf: string; date: string | null; dayLabel: string; nature: string; journey: string; workedMinutes: number | null };
export type PointMirrorDay = { saturday: boolean; sunday: boolean; holiday: boolean; qualifies: boolean; dayMismatch: boolean };

const weekday = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getUTCDay();
const dayLabelWeekday = (label: string) => { const key = comparable(label).replace(/[^a-z]/g, "").slice(0, 3); return ({ dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 } as Record<string, number>)[key]; };

export function isBreakfastExtraDay(row: Pick<PointMirrorRow, "date" | "dayLabel" | "nature" | "journey" | "workedMinutes">): PointMirrorDay {
  const day = row.date ? weekday(row.date) : -1;
  const saturday = day === 6, sunday = day === 0, holiday = comparable(row.nature) === HOLIDAY;
  const labelDay = dayLabelWeekday(row.dayLabel);
  const worked = (row.workedMinutes ?? 0) > 0 && comparable(row.journey) !== EXPECTED_WORK;
  return { saturday, sunday, holiday, qualifies: Boolean(row.date) && worked && (saturday || sunday || holiday), dayMismatch: Boolean(row.date) && labelDay !== undefined && labelDay !== day };
}

// Matriz (CSV/XLSX já lido) → linhas normalizadas. Colunas obrigatórias ausentes bloqueiam tudo.
export function normalizePointMirrorMatrix(matrix: unknown[][]) {
  if (!matrix.length) throw new PointMirrorError("O arquivo está vazio.");
  const headers = matrix[0].map(normalizeCell);
  const index = Object.fromEntries(POINT_MIRROR_REQUIRED_HEADERS.map((name) => [name, findHeader(headers, [name])])) as Record<(typeof POINT_MIRROR_REQUIRED_HEADERS)[number], number>;
  const missing = POINT_MIRROR_REQUIRED_HEADERS.filter((name) => index[name] < 0);
  if (missing.length) throw new PointMirrorError(`Colunas obrigatórias não encontradas no Espelho de Ponto: ${missing.join(", ")}.`);
  const rows: PointMirrorRow[] = [];
  matrix.slice(1).forEach((values, offset) => {
    if (!values.some((value) => normalizeCell(value))) return;
    const rawCpf = normalizeCell(values[index.CPF]);
    rows.push({ sourceRow: offset + 2, name: normalizeCell(values[index.Nome]), rawCpf, cpf: normalizePointMirrorCpf(values[index.CPF]), date: parsePointMirrorDate(values[index.Data]), dayLabel: normalizeCell(values[index.Dia]), nature: normalizeCell(values[index["Natureza Dia"]]), journey: normalizeCell(values[index["Jornada Considerada"]]), workedMinutes: parseWorkedMinutes(values[index["Horas Trabalhadas"]]) });
  });
  return rows;
}

export type PointMirrorPerson = { cpf: string | null; cpfMasked: string; name: string; rows: number; saturdays: number; sundays: number; holidays: number; extraQuantity: number; invalidCpf: boolean };

// Agrega por colaborador (CPF) e conta DATAS distintas qualificadas (CPF + data): sábado que também é
// feriado, ou linha repetida, conta +1. Classificação da data (para o preview): Feriado tem prioridade
// sobre sábado/domingo — cada data entra em uma única coluna, e Sáb + Dom + Feriado = Sugerido.
export function buildBreakfastExtraSuggestions(rows: readonly PointMirrorRow[]) {
  const people = new Map<string, PointMirrorPerson & { dates: Map<string, "SAT" | "SUN" | "HOLIDAY"> }>();
  const warnings: string[] = []; let invalidDates = 0;
  for (const row of rows) {
    const key = row.cpf ?? `invalid:${normalizeCpf(row.rawCpf) || row.name}`;
    const person = people.get(key) ?? { cpf: row.cpf, cpfMasked: row.cpf ? maskCpf(row.cpf) : maskCpf(normalizeCpf(row.rawCpf).padStart(11, "0")), name: row.name, rows: 0, saturdays: 0, sundays: 0, holidays: 0, extraQuantity: 0, invalidCpf: !row.cpf, dates: new Map() };
    person.rows += 1;
    if (!row.date) { invalidDates += 1; people.set(key, person); continue; }
    const day = isBreakfastExtraDay(row);
    if (day.dayMismatch) warnings.push(`Linha ${row.sourceRow}: a coluna Dia (${row.dayLabel}) não corresponde à Data ${row.date.split("-").reverse().join("/")}.`);
    if (day.qualifies) {
      const kind = day.holiday ? "HOLIDAY" : day.saturday ? "SAT" : "SUN";
      const previous = person.dates.get(row.date);
      if (!previous || (kind === "HOLIDAY" && previous !== "HOLIDAY")) person.dates.set(row.date, kind);
    }
    people.set(key, person);
  }
  const list = [...people.values()].map(({ dates, ...person }) => {
    const kinds = [...dates.values()];
    return { ...person, saturdays: kinds.filter((kind) => kind === "SAT").length, sundays: kinds.filter((kind) => kind === "SUN").length, holidays: kinds.filter((kind) => kind === "HOLIDAY").length, extraQuantity: dates.size };
  });
  const allDates = rows.map((row) => row.date).filter((date): date is string => Boolean(date)).sort();
  return {
    people: list,
    totals: { rows: rows.length, people: list.length, saturdays: list.reduce((sum, person) => sum + person.saturdays, 0), sundays: list.reduce((sum, person) => sum + person.sundays, 0), holidays: list.reduce((sum, person) => sum + person.holidays, 0), extraDates: list.reduce((sum, person) => sum + person.extraQuantity, 0), peopleWithExtras: list.filter((person) => person.extraQuantity > 0).length, invalidCpf: list.filter((person) => person.invalidCpf).length, invalidDates },
    period: allDates.length ? { from: allDates[0], to: allDates[allDates.length - 1] } : null,
    warnings: warnings.slice(0, 20),
  };
}

// Aplicação no formulário: ATRIBUI (=) a sugestão — nunca soma — e só para quem está selecionado e
// apto. Reimportar o mesmo arquivo dá o mesmo resultado (idempotente); demais valores ficam intactos.
export function applyBreakfastExtraSuggestions<T extends { extra: string }>(values: Record<string, T>, suggestions: ReadonlyArray<{ employeeId: string; extraQuantity: number; status: string }>) {
  const next = { ...values };
  for (const suggestion of suggestions) if (suggestion.status === "APPLY" && next[suggestion.employeeId]) next[suggestion.employeeId] = { ...next[suggestion.employeeId], extra: String(suggestion.extraQuantity) };
  return next;
}
