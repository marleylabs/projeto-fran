// Espelho de Ponto → Falta Injustificada e Férias da Cesta Básica. Funções puras (sem Prisma): o backend lê o
// arquivo em memória, aplica estas regras e guarda só os ajustes processados (datas por colaborador).
//
// Falta Injustificada: Jornada Considerada = "Falta" E Eventos = "FALTA INJUSTIFICADA" (as duas obrigatórias); é apurada no
// MÊS ANTERIOR à competência (mês calendário completo) e, se existir, corta a Cesta da competência.
// Férias: Eventos = "Férias"/"Ferias" (a Jornada não importa).
// Comparação: trim + minúsculas + sem acento, por igualdade EXATA do evento (sem "contém"). Uma célula de Eventos
// com vários eventos separados por vírgula, ";", "|" ou quebra de linha é avaliada evento a evento, também por igualdade.
// CPF e Data seguem exatamente a normalização do Espelho de Ponto do Café da Manhã (zero à esquerda recuperado).
import { maskCpf, normalizeCpf } from "@/lib/cpf";
import { normalizePointMirrorCpf, parsePointMirrorDate } from "@/modules/accounts-payable/breakfast/point-mirror";
import { findHeader, normalizeCell, normalizeHeader } from "@/modules/accounts-payable/shared/spreadsheet";
import type { BasicBasketContext, BasicBasketOccurrences } from "./calculations";

export const BASIC_BASKET_POINT_MIRROR_HEADERS = ["Nome", "CPF", "Data", "Jornada Considerada", "Eventos"] as const;
export class BasicBasketPointMirrorError extends Error {}

const ABSENCE_JOURNEY = normalizeHeader("Falta");
const ABSENCE_EVENT = normalizeHeader("FALTA INJUSTIFICADA");
const VACATION_EVENT = normalizeHeader("Férias");
const eventTokens = (value: string) => value.split(/[,;|\n]/).map(normalizeHeader).filter(Boolean);

export type BasicBasketPointMirrorRowKind = { absence: boolean; vacation: boolean; absenceEventWithoutJourney: boolean };
export function classifyBasicBasketPointMirrorRow(row: { journey: string; events: string }): BasicBasketPointMirrorRowKind {
  const tokens = eventTokens(row.events); const hasAbsenceEvent = tokens.includes(ABSENCE_EVENT);
  const journeyIsAbsence = normalizeHeader(row.journey) === ABSENCE_JOURNEY;
  return { absence: journeyIsAbsence && hasAbsenceEvent, vacation: tokens.includes(VACATION_EVENT), absenceEventWithoutJourney: hasAbsenceEvent && !journeyIsAbsence };
}

// Célula XLSX com fórmula → só o resultado já salvo (nunca avalia a fórmula).
const cellValue = (value: unknown) => (value && typeof value === "object" && !(value instanceof Date) && "result" in value ? (value as { result: unknown }).result : value);

export type BasicBasketPointMirrorRow = { sourceRow: number; name: string; cpf: string | null; rawCpf: string; date: string | null; journey: string; events: string };
export function normalizeBasicBasketPointMirrorMatrix(matrix: unknown[][]) {
  if (!matrix.length) throw new BasicBasketPointMirrorError("O arquivo está vazio.");
  const headers = matrix[0].map((value) => normalizeCell(cellValue(value)));
  const index = Object.fromEntries(BASIC_BASKET_POINT_MIRROR_HEADERS.map((name) => [name, findHeader(headers, [name])])) as Record<(typeof BASIC_BASKET_POINT_MIRROR_HEADERS)[number], number>;
  const missing = BASIC_BASKET_POINT_MIRROR_HEADERS.filter((name) => index[name] < 0);
  if (missing.length) throw new BasicBasketPointMirrorError(`Colunas obrigatórias não encontradas no Espelho de Ponto: ${missing.join(", ")}.`);
  const rows: BasicBasketPointMirrorRow[] = [];
  matrix.slice(1).forEach((raw, offset) => {
    const values = raw.map(cellValue);
    if (!values.some((value) => normalizeCell(value))) return;
    rows.push({ sourceRow: offset + 2, name: normalizeCell(values[index.Nome]), rawCpf: normalizeCell(values[index.CPF]), cpf: normalizePointMirrorCpf(values[index.CPF]), date: parsePointMirrorDate(values[index.Data]), journey: normalizeCell(values[index["Jornada Considerada"]]), events: String(values[index.Eventos] ?? "").trim() });
  });
  return rows;
}

export type BasicBasketPointMirrorPerson = BasicBasketOccurrences & {
  cpf: string | null; cpfMasked: string; name: string; rows: number; invalidCpf: boolean;
  absenceRows: number; vacationRows: number; duplicateVacationRows: number; absenceEventWithoutJourney: number; outOfPeriodRows: number;
};

// Agrega por CPF. Datas são conjuntos (CPF + Data): linha repetida não duplica.
//  • Falta Injustificada: guardada se cair no MÊS DE APURAÇÃO (mês calendário anterior completo — corta a Cesta da
//    competência) ou no mês da competência (só conferência: afeta a próxima competência). Outros meses: fora do período.
//  • Férias: separadas em mês da competência (Cesta) e mês anterior (Retroativo); outros meses: fora do período.
export function buildBasicBasketPointMirror(rows: readonly BasicBasketPointMirrorRow[], context: BasicBasketContext) {
  type Acc = BasicBasketPointMirrorPerson & { sets: { absence: Set<string>; cv: Set<string>; rv: Set<string> } };
  const people = new Map<string, Acc>(); let invalidDates = 0;
  const within = (date: string, start: string, end: string) => date >= start && date <= end;
  const inCurrent = (date: string) => within(date, context.currentMonthStart, context.currentMonthEnd);
  for (const row of rows) {
    const key = row.cpf ?? `invalid:${normalizeCpf(row.rawCpf) || row.name}`;
    const person: Acc = people.get(key) ?? { cpf: row.cpf, cpfMasked: row.cpf ? maskCpf(row.cpf) : maskCpf(normalizeCpf(row.rawCpf).padStart(11, "0")), name: row.name, rows: 0, invalidCpf: !row.cpf, absenceRows: 0, vacationRows: 0, duplicateVacationRows: 0, absenceEventWithoutJourney: 0, outOfPeriodRows: 0, absenceDates: [], currentVacationDates: [], referenceVacationDates: [], sets: { absence: new Set(), cv: new Set(), rv: new Set() } };
    person.rows += 1; people.set(key, person);
    const kind = classifyBasicBasketPointMirrorRow(row);
    if (kind.absenceEventWithoutJourney) person.absenceEventWithoutJourney += 1;
    if (!kind.absence && !kind.vacation) continue;
    if (!row.date) { invalidDates += 1; continue; }
    let used = false;
    if (kind.absence && (within(row.date, context.absenceReferenceMonthStart, context.absenceReferenceMonthEnd) || inCurrent(row.date))) { person.absenceRows += 1; person.sets.absence.add(row.date); used = true; }
    if (kind.vacation && (inCurrent(row.date) || within(row.date, context.referenceMonthStart, context.referenceMonthEnd))) {
      person.vacationRows += 1; const set = inCurrent(row.date) ? person.sets.cv : person.sets.rv;
      if (set.has(row.date)) person.duplicateVacationRows += 1;
      set.add(row.date); used = true;
    }
    if (!used) person.outOfPeriodRows += 1;
  }
  const list: BasicBasketPointMirrorPerson[] = [...people.values()].map(({ sets, ...person }) => ({ ...person, absenceDates: [...sets.absence].sort(), currentVacationDates: [...sets.cv].sort(), referenceVacationDates: [...sets.rv].sort() }));
  const sum = (pick: (person: BasicBasketPointMirrorPerson) => number) => list.reduce((total, person) => total + pick(person), 0);
  return {
    people: list,
    totals: {
      rows: rows.length, people: list.length, invalidCpf: list.filter((person) => person.invalidCpf).length, invalidDates,
      absenceRows: sum((person) => person.absenceRows), vacationRows: sum((person) => person.vacationRows), duplicateVacationRows: sum((person) => person.duplicateVacationRows),
      vacationDates: sum((person) => person.currentVacationDates.length + person.referenceVacationDates.length), absenceEventWithoutJourney: sum((person) => person.absenceEventWithoutJourney), outOfPeriodRows: sum((person) => person.outOfPeriodRows),
    },
  };
}

// Separa as Faltas guardadas para a prévia. PRIMEIRO o corte pela admissão (anteriores são ignoradas); depois o mês:
// de apuração (cortam esta Cesta) × da competência (próxima competência).
export const splitAbsenceDates = (dates: readonly string[], context: BasicBasketContext, admissionDate: string | null) => {
  const applicable = admissionDate ? dates.filter((date) => date >= admissionDate) : [...dates];
  return {
    beforeAdmission: admissionDate ? dates.filter((date) => date < admissionDate) : [],
    apuration: applicable.filter((date) => date >= context.absenceReferenceMonthStart && date <= context.absenceReferenceMonthEnd),
    nextCompetence: applicable.filter((date) => date >= context.currentMonthStart && date <= context.currentMonthEnd),
  };
};

export const occurrencesOf = (person: BasicBasketOccurrences): BasicBasketOccurrences => ({ absenceDates: person.absenceDates, currentVacationDates: person.currentVacationDates, referenceVacationDates: person.referenceVacationDates });
export const hasOccurrences = (person: BasicBasketOccurrences) => Boolean(person.absenceDates.length || person.currentVacationDates.length || person.referenceVacationDates.length);

// Validação do JSON guardado (defesa em profundidade ao reler a importação no salvamento).
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function parseStoredOccurrences(value: unknown): Record<string, BasicBasketOccurrences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BasicBasketPointMirrorError("Importação do Espelho de Ponto inválida.");
  const dates = (list: unknown) => { if (!Array.isArray(list) || !list.every((item) => typeof item === "string" && ISO.test(item))) throw new BasicBasketPointMirrorError("Importação do Espelho de Ponto inválida."); return list as string[]; };
  return Object.fromEntries(Object.entries(value as Record<string, Record<string, unknown>>).map(([employeeId, item]) => [employeeId, { absenceDates: dates(item?.absenceDates), currentVacationDates: dates(item?.currentVacationDates), referenceVacationDates: dates(item?.referenceVacationDates) }]));
}