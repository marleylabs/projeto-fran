// Leitura da planilha de refeições de Alimentação MA (CSV ou XLSX) com colunas DATA, NOME e SETOR.
// Função pura (sem banco): gera as ocorrências (uma por linha) e as inconsistências por linha.
// Consumido por ma-server.ts (upload MA); as normalizações de nome/setor também por pa-server.ts,
// manual-server.ts, matching.ts e transit-voucher. O vínculo com o colaborador é feito depois (matching.ts).
import { findHeader, normalizeCell, normalizeHeader, readCsvMatrix, readXlsxMatrices } from "@/modules/accounts-payable/shared/spreadsheet";
import { organizationalComparisonKey } from "@/lib/organizational-label";
/** Linha válida lida da planilha. sourceRow é o número da linha no arquivo (1 = cabeçalho). */
export type FoodMealSource = { sourceRow: number; occurredOn: Date; receivedName: string; normalizedReceivedName: string; receivedDepartment: string };
/** Inconsistência de leitura (data inválida, nome/setor ausente, cabeçalho inesperado, arquivo vazio). */
export type FoodMealParseIssue = { sourceRow: number | null; employeeName: string | null; code: string; message: string };
export type FoodMealParseResult = { sheetName: string; totalRows: number; occurrences: FoodMealSource[]; issues: FoodMealParseIssue[] };
// Sinônimos aceitos para cada cabeçalho (comparados já normalizados).
const DATE = ["data", "date", "dia"]; const NAME = ["nome", "colaborador", "nome colaborador", "funcionario", "funcionário"]; const DEPARTMENT = ["setor", "departamento", "centro de custo", "centro custo"];
/** Normaliza nome para comparação: minúsculo, sem acento, só letras/dígitos/espaço. */
export function normalizeFoodName(value: unknown) { return normalizeHeader(value).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
/** Normaliza setor/departamento para comparação (mantém ponto, ex.: códigos de centro de custo). */
export function normalizeFoodDepartment(value: unknown) { return organizationalComparisonKey(value).replace(/[^a-z0-9. ]/g, "").replace(/\s+/g, " ").trim(); }
// Aceita Date do Excel, serial numérico do Excel (base 30/12/1899), dd/mm/aa(aa) ou texto ISO; sempre devolve meia-noite UTC.
function parseDate(value: unknown) { if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); if (typeof value === "number" && Number.isFinite(value)) { const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000); return Number.isNaN(date.getTime()) ? null : date; } const text = normalizeCell(value); const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (br) { const year = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]); const date = new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1]))); return Number.isNaN(date.getTime()) ? null : date; } const date = new Date(text); return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); }
// Valida o cabeçalho (linha 1) e percorre as linhas; linhas totalmente vazias são ignoradas, as demais viram
// ocorrência ou inconsistência (uma por linha, primeira falha encontrada).
function process(matrix: unknown[][], sheetName: string): FoodMealParseResult { if (!matrix.length) return { sheetName, totalRows: 0, occurrences: [], issues: [{ sourceRow: null, employeeName: null, code: "EMPTY_FILE", message: "O arquivo está vazio." }] }; const headers = matrix[0].map(normalizeCell); const dateIndex = findHeader(headers, DATE); const nameIndex = findHeader(headers, NAME); const departmentIndex = findHeader(headers, DEPARTMENT); if (dateIndex < 0 || nameIndex < 0 || departmentIndex < 0) return { sheetName, totalRows: Math.max(0, matrix.length - 1), occurrences: [], issues: [{ sourceRow: 1, employeeName: null, code: "UNEXPECTED_HEADER", message: "A aba de origem deve conter DATA, NOME e SETOR." }] };
  const occurrences: FoodMealSource[] = []; const issues: FoodMealParseIssue[] = []; for (let index = 1; index < matrix.length; index += 1) { const sourceRow = index + 1; const values = matrix[index]; if (!values.some((value) => normalizeCell(value))) continue; const receivedName = normalizeCell(values[nameIndex]); const receivedDepartment = normalizeCell(values[departmentIndex]); const occurredOn = parseDate(values[dateIndex]); if (!occurredOn) { issues.push({ sourceRow, employeeName: receivedName || null, code: "INVALID_DATE", message: "Data ausente ou inválida." }); continue; } if (!receivedName) { issues.push({ sourceRow, employeeName: null, code: "MISSING_EMPLOYEE", message: "Nome não informado." }); continue; } if (!receivedDepartment) { issues.push({ sourceRow, employeeName: receivedName, code: "MISSING_DEPARTMENT", message: "Setor não informado." }); continue; } occurrences.push({ sourceRow, occurredOn, receivedName, normalizedReceivedName: normalizeFoodName(receivedName), receivedDepartment }); }
  return { sheetName, totalRows: Math.max(0, matrix.length - 1), occurrences, issues };
}
/** Lê CSV de refeições MA. */
export function parseFoodMealCsv(text: string) { return process(readCsvMatrix(text), "CSV"); }
/** Lê XLSX de refeições MA: usa a primeira aba que tenha DATA, NOME e SETOR; senão processa a primeira aba (gerando o erro de cabeçalho). */
export async function parseFoodMealXlsx(buffer: Buffer) { const sheets = await readXlsxMatrices(buffer); for (const sheet of sheets) { const headers = sheet.matrix[0]?.map(normalizeCell) ?? []; if (findHeader(headers, DATE) >= 0 && findHeader(headers, NAME) >= 0 && findHeader(headers, DEPARTMENT) >= 0) return process(sheet.matrix, sheet.name); } return process(sheets[0]?.matrix ?? [], sheets[0]?.name ?? ""); }
