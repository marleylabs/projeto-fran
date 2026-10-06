// Datas "só dia" (DATE, sem hora): helper único para cadastro e importação. Internamente a data é
// sempre "yyyy-MM-dd"; no banco vai como meia-noite UTC (@db.Date), e toda leitura/formatação usa
// as partes UTC — assim 05/10/2026 nunca vira 04/10 ou 06/10 por fuso horário.

export class DateOnlyValidationError extends Error {}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const pad = (value: number) => String(value).padStart(2, "0");
const isoFromParts = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}` : null;
};

// Aceita: "dd/MM/yyyy" (padrão BR), "yyyy-MM-dd" (input type=date / ISO), Date real (célula de data
// do XLSX) e número serial do Excel. Ambíguos como "10/05/26" não são aceitos. Inválido → null.
export function parseDateOnly(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return null;
    return parseDateOnly(new Date(EXCEL_EPOCH_MS + Math.floor(value) * 86400000));
  }
  const text = String(value ?? "").trim();
  let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (match) return isoFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(text);
  if (match) return isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  return null;
}

// Célula de planilha (XLSX): Date/serial/texto. Vazia → "empty"; preenchida e inválida → "invalid".
export type SpreadsheetDate = { status: "date"; iso: string } | { status: "empty" } | { status: "invalid" };

export function parseSpreadsheetDate(value: unknown): SpreadsheetDate {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return { status: "empty" };
  const iso = parseDateOnly(value);
  return iso ? { status: "date", iso } : { status: "invalid" };
}

// Entrada opcional do formulário: vazio → null; preenchido → data válida ou erro.
export function parseOptionalDateOnly(value: unknown, label = "Data"): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const iso = parseDateOnly(value);
  if (!iso) throw new DateOnlyValidationError(`${label} inválida.`);
  return iso;
}

export const dateOnlyToDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const dateOnlyFromDb = (value: Date | string | null | undefined) => (value ? parseDateOnly(value instanceof Date ? value : String(value)) : null);
export const formatDateOnlyBR = (value: Date | string | null | undefined) => { const iso = dateOnlyFromDb(value); return iso ? iso.split("-").reverse().join("/") : ""; };
