import ExcelJS from "exceljs";
import type { Prisma } from "@/generated/prisma";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { formatBreakfastObservation } from "./calculations";
import { addAllocationViewSheets } from "@/modules/accounts-payable/shared/allocation-views-workbook";
import { normalizeAllocationRow } from "@/modules/accounts-payable/shared/allocation-views";
import { amountToCents, groupBreakfastByCompanyCostCenter } from "./rateio";

// Montagem pura do XLSX do Café da Manhã (sem server-only) — o download (export.ts) só serializa.
export type BreakfastWorkbookMap = Prisma.BreakfastMapGetPayload<{ include: { competence: true; administrativeEntity: true; allocations: true } }>;
const MONEY = 'R$ #,##0.00';
function header(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAF1B1B" } }; }
function total(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }; }
const dept = (row: BreakfastWorkbookMap["allocations"][number]) => row.department ?? "Não informado";

export function buildBreakfastWorkbook(map: BreakfastWorkbookMap) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Gestão Administrativa";
  const rows = [...map.allocations].sort((a, b) => comparePtBr(a.company, b.company) || comparePtBr(dept(a), dept(b)) || comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id));
  const rateio = groupBreakfastByCompanyCostCenter(rows);
  const grand = rateio.grandCents / 100;

  // Resumo: Empresa → Centro de Custo (snapshot do lançamento) → Valor (mesma lógica do Resumo da tela).
  const summary = workbook.addWorksheet("Resumo");
  summary.addRow(["Empresa / Centro de Custo", "Colaboradores", "A pagar"]); header(summary.getRow(1));
  for (const company of rateio.companies) {
    const line = summary.addRow([company.company, company.people, company.totalCents / 100]); line.font = { bold: true };
    for (const costCenter of company.costCenters) summary.addRow([`   ↳ ${costCenter.costCenter}`, costCenter.people, costCenter.totalCents / 100]);
  }
  if (!rateio.consistent) throw new Error(`Inconsistência no resumo de Café da Manhã: empresas ${(rateio.companiesCents / 100).toFixed(2)} / centros de custo ${(rateio.costCentersCents / 100).toFixed(2)} ≠ total ${grand.toFixed(2)}.`);
  total(summary.addRow(["Total Geral", rateio.people, grand]));
  summary.columns = [{ width: 42 }, { width: 16 }, { width: 20 }]; summary.getColumn(3).numFmt = MONEY;

  const detail = workbook.addWorksheet("Rateio por Colaborador");
  detail.addRow(["Empresa", "Nome", "Departamento", "Centro de custo", "Dias Úteis", "Quantidade", "Quantidade Extras", "Desconto", "Quantidade Final", "Valor Unitário", "Valor Total", "Observação"]); header(detail.getRow(1));
  for (const row of rows) detail.addRow([row.company, row.employeeName, row.department ?? "", row.costCenter ?? "", row.workingDays ?? "", row.baseQuantity ?? "", row.extraQuantity ?? "", row.discountQuantity, row.finalQuantity ?? "", row.unitPrice ? Number(row.unitPrice) : "", Number(row.amount), formatBreakfastObservation(row.observationType, row.observationDetails)]);
  total(detail.addRow(["TOTAL", "", "", "", "", "", "", "", "", "", grand, ""]));
  detail.columns = [28, 34, 28, 28, 12, 14, 16, 12, 16, 16, 16, 40].map((width) => ({ width })); [10, 11].forEach((column) => { detail.getColumn(column).numFmt = MONEY; });

  const audit = workbook.addWorksheet("Auditoria");
  audit.addRows([["Competência", `${String(map.competence.month).padStart(2, "0")}/${map.competence.year}`], ["Versão", map.version], ["Lançado em", map.createdAt], ["Cadastro da obrigação", `${map.administrativeEntity.tradeName} / ${map.administrativeEntityId}`], ["Valor total", Number(map.totalAmount)], ["Feriados considerados", holidaysText(map.holidaysSnapshot)]]);
  audit.getColumn(1).font = { bold: true }; audit.getColumn(1).width = 28; audit.getColumn(2).width = 70; audit.getCell("B5").numFmt = MONEY;

  // Perspectivas de rateio (abas novas, ao final, sem alterar as existentes): só agrupam o valor final salvo
  // (snapshots de Empresa/Centro de Custo/Departamento da alocação) e precisam fechar com o total do lançamento.
  addAllocationViewSheets(workbook, rows.map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: amountToCents(row.amount), source: row })), { expectedCents: amountToCents(map.totalAmount), context: "Café da Manhã", style: { header, total, moneyFormat: MONEY } });
  return workbook;
}

function holidaysText(snapshot: unknown) {
  if (!Array.isArray(snapshot)) return "Não registrado";
  if (!snapshot.length) return "Nenhum";
  return (snapshot as { date: string; name: string }[]).map((holiday) => `${holiday.date.split("-").reverse().join("/")} - ${holiday.name}`).join("; ");
}
