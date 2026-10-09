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

// Célula de planilha (XLSX): além de Date/serial/texto, aceita célula com FÓRMULA usando só o resultado
// já calculado e salvo no arquivo (ExcelJS: { formula | sharedFormula, result }). A fórmula nunca é
// avaliada e vínculos externos não são acessados. Para fórmula:
//   result ausente ou erro do Excel (#N/A, #REF!...) → "formula-without-result" (mensagem específica);
//   result 0 (ex.: XLOOKUP(...,0) sem correspondência — o ExcelJS entrega 30/12/1899), null ou "" → vazio.
export type SpreadsheetDate = { status: "date"; iso: string } | { status: "empty" } | { status: "invalid" } | { status: "formula-without-result" };
type FormulaCell = { formula?: string; sharedFormula?: string; result?: unknown };
const isFormulaCell = (value: unknown): value is FormulaCell => typeof value === "object" && value !== null && !(value instanceof Date) && ("formula" in value || "sharedFormula" in value);
const isExcelZeroDate = (value: unknown) => value instanceof Date && value.getTime() === EXCEL_EPOCH_MS;

export function parseSpreadsheetDate(value: unknown): SpreadsheetDate {
  if (isFormulaCell(value)) {
    const result = value.result;
    if (result === undefined) return { status: "formula-without-result" };
    if (result === null || result === 0 || (typeof result === "string" && !result.trim()) || isExcelZeroDate(result)) return { status: "empty" };
    // erro do Excel: { error: "#N/A" } (leitura), NaN (round-trip do ExcelJS) ou o texto "#REF!"/"#VALUE!"...
    if ((typeof result === "object" && !(result instanceof Date)) || (typeof result === "number" && !Number.isFinite(result)) || (typeof result === "string" && result.trim().startsWith("#"))) return { status: "formula-without-result" };
    return parseSpreadsheetDate(result);
  }
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
