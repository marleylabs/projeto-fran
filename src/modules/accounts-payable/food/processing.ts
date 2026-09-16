import { findHeader, normalizeCell, readCsvMatrix, readXlsxMatrix } from "@/modules/accounts-payable/shared/spreadsheet";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";

export type FoodSourceRow = { sourceRow: number; identifier: string | null; employeeName: string; department: string };
export type FoodProcessingIssue = { sourceRow: number | null; employeeName: string | null; code: string; message: string };
export type FoodProcessingResult = { totalRows: number; allocations: FoodSourceRow[]; issues: FoodProcessingIssue[] };

const NAME_HEADERS = new Set(["colaborador", "nome", "nome colaborador", "funcionario", "funcionário"]);
const DEPARTMENT_HEADERS = new Set(["setor", "departamento", "centro de custo", "centro custo"]);
const IDENTIFIER_HEADERS = new Set(["matricula", "matrícula", "cpf", "id", "codigo", "código"]);

const normalize = normalizeCell;

function processMatrix(matrix: unknown[][]): FoodProcessingResult {
  const issues: FoodProcessingIssue[] = [];
  if (matrix.length === 0) return { totalRows: 0, allocations: [], issues: [{ sourceRow: null, employeeName: null, code: "EMPTY_FILE", message: "O arquivo está vazio." }] };
  const headers = matrix[0].map(normalize);
  const nameIndex = findHeader(headers, [...NAME_HEADERS]);
  const departmentIndex = findHeader(headers, [...DEPARTMENT_HEADERS]);
  const identifierIndex = findHeader(headers, [...IDENTIFIER_HEADERS]);
  if (nameIndex < 0 || departmentIndex < 0) {
    return { totalRows: Math.max(0, matrix.length - 1), allocations: [], issues: [{ sourceRow: 1, employeeName: null, code: "UNEXPECTED_HEADER", message: "Cabeçalho inválido. Informe ao menos Colaborador/Nome e Setor/Departamento." }] };
  }

  const allocations: FoodSourceRow[] = [];
  const seenIdentifiers = new Set<string>();
  const seenNames = new Set<string>();
  for (let index = 1; index < matrix.length; index += 1) {
    const sourceRow = index + 1;
    const values = matrix[index];
    const employeeName = normalize(values[nameIndex]);
    const department = normalizeOrganizationalValue(values[departmentIndex]);
    const identifier = identifierIndex >= 0 ? normalize(values[identifierIndex]) || null : null;
    if (!values.some((value) => normalize(value))) {
      issues.push({ sourceRow, employeeName: null, code: "EMPTY_ROW", message: "Linha vazia não incluída no cálculo." });
      continue;
    }
    if (!employeeName) { issues.push({ sourceRow, employeeName: null, code: "MISSING_EMPLOYEE", message: "Colaborador sem nome ou identificador legível." }); continue; }
    if (!department) { issues.push({ sourceRow, employeeName, code: "MISSING_DEPARTMENT", message: "Colaborador sem setor/departamento." }); continue; }
    const identifierKey = identifier?.toLocaleLowerCase("pt-BR");
    const nameKey = employeeName.toLocaleLowerCase("pt-BR");
    if (identifierKey && seenIdentifiers.has(identifierKey)) {
      issues.push({ sourceRow, employeeName, code: "DUPLICATE_IDENTIFIER", message: `Identificador duplicado: ${identifier}.` });
      continue;
    }
    if (!identifierKey && seenNames.has(nameKey)) {
      issues.push({ sourceRow, employeeName, code: "POSSIBLE_DUPLICATE_NAME", message: "Possível duplicidade por nome; revise antes de finalizar." });
      continue;
    }
    if (identifierKey) seenIdentifiers.add(identifierKey);
    seenNames.add(nameKey);
    allocations.push({ sourceRow, identifier, employeeName, department });
  }
  return { totalRows: Math.max(0, matrix.length - 1), allocations, issues };
}

export function parseFoodCsv(text: string): FoodProcessingResult {
  return processMatrix(readCsvMatrix(text));
}

export async function parseFoodXlsx(buffer: Buffer): Promise<FoodProcessingResult> {
  return processMatrix(await readXlsxMatrix(buffer));
}

export function localityAllows(entityLocality: string, batchLocality: "MA" | "PA") {
  return entityLocality.toUpperCase().split(/[\/,;]/).map((value) => value.trim()).includes(batchLocality);
}
