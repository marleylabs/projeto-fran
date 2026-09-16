import ExcelJS from "exceljs";

export function normalizeCell(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " "); }
export function normalizeHeader(value: unknown) { return normalizeCell(value).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
export function findHeader(headers: string[], aliases: string[]) { const accepted = new Set(aliases.map(normalizeHeader)); return headers.findIndex((header) => accepted.has(normalizeHeader(header))); }

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { values.push(value); value = ""; } else value += char; }
  values.push(value); return values;
}
export function readCsvMatrix(text: string) { const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/); while (lines.length && !lines.at(-1)?.trim()) lines.pop(); const first = lines[0] ?? ""; const delimiter = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ","; return lines.map((line) => parseCsvLine(line, delimiter)); }
export async function readXlsxMatrix(buffer: Buffer, preferredSheetName?: string) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never); const worksheet = (preferredSheetName ? workbook.getWorksheet(preferredSheetName) : undefined) ?? workbook.worksheets[0]; if (!worksheet) return []; const matrix: unknown[][] = []; worksheet.eachRow({ includeEmpty: true }, (row) => { const values = Array.isArray(row.values) ? row.values.slice(1).map((value) => typeof value === "object" && value && "text" in value ? String(value.text) : value) : []; matrix.push(values); }); return matrix; }
export async function readXlsxMatrices(buffer: Buffer) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never); return workbook.worksheets.map((worksheet) => { const matrix: unknown[][] = []; worksheet.eachRow({ includeEmpty: true }, (row) => { const values = Array.isArray(row.values) ? row.values.slice(1).map((value) => typeof value === "object" && value && "text" in value ? String(value.text) : value) : []; matrix.push(values); }); return { name: worksheet.name, matrix }; }); }
