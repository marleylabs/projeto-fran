import ExcelJS from "exceljs";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { isValidCpf, normalizeCpf } from "@/lib/cpf";
import { amountToCents } from "./rateio";

// Máscara Flash do Café da Manhã: arquivo de IMPORTAÇÃO (Flash), uma linha por colaborador do
// lançamento salvo. Reproduz programaticamente a máscara fornecida (Mascara_Flash.xlsx): mesma
// planilha, cabeçalhos, ordem, formatos e larguras — sem título, total ou colunas extras.
// Valores vêm só do lançamento (snapshot): nome e valor de BreakfastAllocation, CNPJ da Company
// vinculada por companyId (Company.taxId é obrigatório, único e não editável no sistema).
// CPF: lido do cadastro atual do colaborador (BreakfastAllocation.employeeId → FoodEmployee.cpf) —
// não há snapshot de CPF no lançamento; aceitável porque CPF identifica a própria pessoa (não é um
// valor financeiro variável). Sem CPF cadastrado → célula vazia.
export const FLASH_SHEET_NAME = "0gxOg0uxTD06R5KuSS08v";
export const FLASH_HEADERS = ["CNPJ", "NOME COMPLETO", "CPF", "FLEXIVEL (R$)"] as const;
const FLASH_MONEY = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
const FLASH_CPF = '000"."000"."000"-"00';

export class BreakfastFlashExportError extends Error {}

export type BreakfastFlashAllocation = {
  id: string; employeeId: string | null; employeeName: string; company: string; companyId: string | null;
  amount: { toString(): string } | string | number;
  companyRef: { taxId: string } | null;
  employee?: { cpf: string | null } | null;
};
export type BreakfastFlashMap = { totalAmount: { toString(): string } | string | number; financialRecord: { grossAmount: { toString(): string } | string | number } | null; allocations: BreakfastFlashAllocation[] };

export function buildBreakfastFlashRows(map: BreakfastFlashMap) {
  if (!map.allocations.length) throw new BreakfastFlashExportError("Não há colaboradores para exportar.");
  const people = new Set<string>();
  for (const row of map.allocations) {
    const key = row.employeeId ?? row.employeeName.trim().toLocaleLowerCase("pt-BR");
    if (people.has(key)) throw new BreakfastFlashExportError(`O colaborador ${row.employeeName} aparece mais de uma vez no lançamento.`);
    people.add(key);
  }
  const missing = [...new Set(map.allocations.filter((row) => !/^\d{14}$/.test(row.companyRef?.taxId?.replace(/\D/g, "") ?? "")).map((row) => row.company))].sort(comparePtBr);
  if (missing.length) throw new BreakfastFlashExportError(missing.length === 1 ? `A empresa ${missing[0]} não possui CNPJ cadastrado.` : `As empresas ${missing.join(", ")} não possuem CNPJ cadastrado.`);
  const rows = [...map.allocations]
    .sort((a, b) => comparePtBr(a.company, b.company) || comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id))
    .map((row) => ({ cnpj: row.companyRef!.taxId.trim(), name: row.employeeName.trim(), cpf: isValidCpf(row.employee?.cpf) ? normalizeCpf(row.employee!.cpf) : null, cents: amountToCents(row.amount) }));
  // Obrigatório antes de liberar o arquivo: SUM(FLEXIVEL) = total do lançamento = FinancialRecord.
  const sum = rows.reduce((total, row) => total + row.cents, 0);
  if (!map.financialRecord) throw new BreakfastFlashExportError("Lançamento sem obrigação financeira vinculada.");
  const mapTotal = amountToCents(map.totalAmount), financial = amountToCents(map.financialRecord.grossAmount);
  if (sum !== mapTotal || sum !== financial) throw new BreakfastFlashExportError(`Inconsistência na Máscara Flash: colaboradores ${(sum / 100).toFixed(2)}, lançamento ${(mapTotal / 100).toFixed(2)}, obrigação ${(financial / 100).toFixed(2)}.`);
  return { rows, totalCents: sum };
}

export function buildBreakfastFlashWorkbook(map: BreakfastFlashMap) {
  const { rows } = buildBreakfastFlashRows(map);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(FLASH_SHEET_NAME);
  sheet.columns = [{ width: 35 }, { width: 46.625 }, { width: 16.875 }, { width: 19 }];
  const head = sheet.addRow([...FLASH_HEADERS]);
  head.eachCell((cell) => { cell.font = { name: "Nunito", size: 12, color: { theme: 1 } }; cell.alignment = { horizontal: "center", vertical: "middle" }; });
  const thin = { style: "thin" as const, color: { argb: "FF000000" } }; // máscara usa indexed 64 (cor automática = preto)
  for (const row of rows) {
    // CPF: número com o formato da máscara (000.000.000-00 — o formato repõe zeros à esquerda e evita
    // notação científica); sem CPF, a célula fica realmente vazia (sem valor).
    const line = sheet.addRow([row.cnpj, row.name, row.cpf ? Number(row.cpf) : null, row.cents / 100]);
    const [cnpj, name, cpf, flex] = [1, 2, 3, 4].map((column) => line.getCell(column));
    cnpj.numFmt = "@"; cnpj.font = { name: "Nunito", size: 12, color: { argb: "FF4A4E57" } }; cnpj.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    name.font = { name: "Nunito", size: 12 }; name.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    cpf.numFmt = FLASH_CPF; cpf.font = { name: "Nunito", size: 12 }; cpf.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    flex.numFmt = FLASH_MONEY; flex.font = { name: "Arial", family: 2, size: 11, color: { theme: 1 } }; flex.alignment = { vertical: "middle", wrapText: true };
    for (const cell of [cnpj, name, cpf]) cell.border = { left: thin, right: thin, top: thin, bottom: thin };
    flex.border = { left: thin, top: thin, bottom: thin };
  }
  sheet.autoFilter = "A1:D1";
  return workbook;
}
