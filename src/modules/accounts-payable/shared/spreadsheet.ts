// Leitura básica de planilhas (CSV e XLSX) compartilhada pelos benefícios de Contas a Pagar (Alimentação,
// Vale Transporte, espelhos de ponto do Café da Manhã/Cesta Básica) e pela importação de colaboradores.
// Só converte o arquivo em matriz de valores (linhas × colunas); validação e regras ficam em cada módulo.
import ExcelJS from "exceljs";

/** Converte a célula em texto: trim e espaços internos colapsados. */
export function normalizeCell(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " "); }
/** Normaliza cabeçalho para comparação: minúsculo pt-BR e sem acentos. */
export function normalizeHeader(value: unknown) { return normalizeCell(value).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
/** Índice da primeira coluna cujo cabeçalho normalizado está entre os sinônimos aceitos (-1 se nenhuma). */
export function findHeader(headers: string[], aliases: string[]) { const accepted = new Set(aliases.map(normalizeHeader)); return headers.findIndex((header) => accepted.has(normalizeHeader(header))); }

// Parser de uma linha CSV com aspas (aspas duplas escapadas por ""). Não trata quebra de linha dentro de aspas.
function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { values.push(value); value = ""; } else value += char; }
  values.push(value); return values;
}
/**
 * CSV → matriz. Remove BOM e linhas vazias do final; o delimitador é detectado pela 1ª linha (";" quando há
 * pelo menos tantos ";" quanto ","), padrão das exportações do Excel em pt-BR.
 */
export function readCsvMatrix(text: string) { const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/); while (lines.length && !lines.at(-1)?.trim()) lines.pop(); const first = lines[0] ?? ""; const delimiter = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ","; return lines.map((line) => parseCsvLine(line, delimiter)); }
/**
 * XLSX → matriz de uma aba (a preferida pelo nome ou a primeira). row.values do ExcelJS começa no índice 1,
 * por isso o slice(1); células rich text/hyperlink viram o texto. Retorna [] se não houver aba.
 */
export async function readXlsxMatrix(buffer: Buffer, preferredSheetName?: string) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never); const worksheet = (preferredSheetName ? workbook.getWorksheet(preferredSheetName) : undefined) ?? workbook.worksheets[0]; if (!worksheet) return []; const matrix: unknown[][] = []; worksheet.eachRow({ includeEmpty: true }, (row) => { const values = Array.isArray(row.values) ? row.values.slice(1).map((value) => typeof value === "object" && value && "text" in value ? String(value.text) : value) : []; matrix.push(values); }); return matrix; }
/** XLSX → matriz de todas as abas, com o nome de cada uma (usado quando a aba certa é descoberta pelo cabeçalho). */
export async function readXlsxMatrices(buffer: Buffer) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never); return workbook.worksheets.map((worksheet) => { const matrix: unknown[][] = []; worksheet.eachRow({ includeEmpty: true }, (row) => { const values = Array.isArray(row.values) ? row.values.slice(1).map((value) => typeof value === "object" && value && "text" in value ? String(value.text) : value) : []; matrix.push(values); }); return { name: worksheet.name, matrix }; }); }
