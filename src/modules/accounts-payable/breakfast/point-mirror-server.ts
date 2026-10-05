import "server-only";
import { prisma } from "@/lib/db/prisma";
import { organizationalComparisonKey } from "@/lib/organizational-label";
import { readCsvMatrix, readXlsxMatrix } from "@/modules/accounts-payable/shared/spreadsheet";
import { BREAKFAST_ALLOWED_DEPARTMENT } from "./calculations";
import { buildBreakfastExtraSuggestions, normalizePointMirrorMatrix, PointMirrorError } from "./point-mirror";

// Espelho de Ponto: processado só em memória — o arquivo (CPF, PIS, CNPJ, jornada) não é salvo em
// banco/disco/storage e nada dele vai para log. Match EXCLUSIVAMENTE por CPF normalizado (nome nunca é
// usado como fallback); depois valida a regra TOPOGEO e a seleção atual do formulário.
export type PointMirrorStatus = "APPLY" | "NOT_SELECTED" | "NOT_ELIGIBLE" | "NOT_FOUND" | "INVALID_CPF" | "NOT_IN_FILE";

function decodeCsv(buffer: Buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); } // BOM removido por readCsvMatrix
  catch { return new TextDecoder("windows-1252").decode(buffer); }
}

async function readMatrix(buffer: Buffer, fileName: string) {
  const name = fileName.toLowerCase();
  try {
    if (name.endsWith(".csv")) return readCsvMatrix(decodeCsv(buffer));
    if (name.endsWith(".xlsx")) return await readXlsxMatrix(buffer); // só valores; sem macros/fórmulas externas
  } catch {
    throw new PointMirrorError("Não foi possível ler o arquivo. Envie o Espelho de Ponto em CSV (separado por ;) ou XLSX.");
  }
  throw new PointMirrorError("Formato não suportado. Envie o Espelho de Ponto em .csv ou .xlsx.");
}

export async function previewBreakfastPointMirror(input: { buffer: Buffer; fileName: string; selectedIds: string[] }) {
  const parsed = buildBreakfastExtraSuggestions(normalizePointMirrorMatrix(await readMatrix(input.buffer, input.fileName)));
  if (!parsed.totals.rows) throw new PointMirrorError("O Espelho de Ponto não possui linhas de colaboradores.");
  const cpfs = [...new Set(parsed.people.map((person) => person.cpf).filter((cpf): cpf is string => Boolean(cpf)))];
  const selected = new Set(input.selectedIds);
  const employees = cpfs.length ? await prisma.foodEmployee.findMany({ where: { cpf: { in: cpfs } }, select: { id: true, officialName: true, department: true, active: true, cpf: true } }) : [];
  const byCpf = new Map(employees.map((employee) => [employee.cpf!, employee]));
  const allowed = organizationalComparisonKey(BREAKFAST_ALLOWED_DEPARTMENT);

  type PreviewPerson = { employeeId: string | null; employeeName: string; cpfMasked: string; saturdays: number; sundays: number; holidays: number; extraQuantity: number; status: PointMirrorStatus };
  const people: PreviewPerson[] = parsed.people.map((person) => {
    const employee = person.cpf ? byCpf.get(person.cpf) : undefined;
    const status: PointMirrorStatus = !person.cpf ? "INVALID_CPF" : !employee ? "NOT_FOUND"
      : !employee.active || organizationalComparisonKey(employee.department) !== allowed ? "NOT_ELIGIBLE"
      : !selected.has(employee.id) ? "NOT_SELECTED" : "APPLY";
    // Resposta sem CPF completo: só a forma mascarada. Nome do arquivo apenas para quem não foi localizado.
    return { employeeId: employee?.id ?? null, employeeName: employee?.officialName ?? person.name, cpfMasked: person.cpfMasked, saturdays: person.saturdays, sundays: person.sundays, holidays: person.holidays, extraQuantity: person.extraQuantity, status };
  });
  // Selecionados que não aparecem no arquivo: nada é alterado (diferente de "presente com 0 extras").
  const inFile = new Set(people.map((person) => person.employeeId).filter(Boolean));
  const missingIds = input.selectedIds.filter((id) => !inFile.has(id));
  const missing = missingIds.length ? await prisma.foodEmployee.findMany({ where: { id: { in: missingIds } }, select: { id: true, officialName: true } }) : [];
  for (const employee of missing) people.push({ employeeId: employee.id, employeeName: employee.officialName, cpfMasked: "", saturdays: 0, sundays: 0, holidays: 0, extraQuantity: 0, status: "NOT_IN_FILE" });

  const count = (status: PointMirrorStatus) => people.filter((person) => person.status === status).length;
  return {
    period: parsed.period,
    totals: { ...parsed.totals, located: people.filter((person) => person.employeeId && person.status !== "NOT_IN_FILE").length, notFound: count("NOT_FOUND"), apply: count("APPLY"), notSelected: count("NOT_SELECTED"), notEligible: count("NOT_ELIGIBLE"), notInFile: count("NOT_IN_FILE") },
    warnings: parsed.warnings,
    people,
  };
}
