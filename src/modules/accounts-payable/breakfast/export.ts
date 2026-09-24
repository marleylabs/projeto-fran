import "server-only";
import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { formatBreakfastObservation } from "./calculations";

type MapData = Prisma.BreakfastMapGetPayload<{ include: { competence: true; administrativeEntity: true; allocations: true } }>;
const MONEY = 'R$ #,##0.00';
function header(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAF1B1B" } }; }
function total(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }; }
const dept = (row: MapData["allocations"][number]) => row.department ?? "Não informado";

export async function exportBreakfastMap(map: MapData) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Gestão Administrativa";
  const rows = [...map.allocations].sort((a, b) => comparePtBr(a.company, b.company) || comparePtBr(dept(a), dept(b)) || comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id));
  const grand = rows.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));

  // Resumo: Empresa → Departamento → Valor (mesma lógica do Resumo da tela).
  const summary = workbook.addWorksheet("Resumo");
  summary.addRow(["Empresa / Departamento", "Colaboradores", "A pagar"]); header(summary.getRow(1));
  const companies = new Map<string, Map<string, { people: Set<string>; total: Prisma.Decimal }>>();
  for (const row of rows) {
    const departments = companies.get(row.company) ?? new Map();
    const entry = departments.get(dept(row)) ?? { people: new Set<string>(), total: new Prisma.Decimal(0) };
    entry.people.add(row.employeeId ?? row.employeeName); entry.total = entry.total.add(row.amount);
    departments.set(dept(row), entry); companies.set(row.company, departments);
  }
  let companySum = new Prisma.Decimal(0);
  for (const [company, departments] of [...companies].sort(([a], [b]) => comparePtBr(a, b))) {
    const companyTotal = [...departments.values()].reduce((sum, value) => sum.add(value.total), new Prisma.Decimal(0));
    companySum = companySum.add(companyTotal);
    const line = summary.addRow([company, new Set([...departments.values()].flatMap((value) => [...value.people])).size, Number(companyTotal)]); line.font = { bold: true };
    for (const [department, value] of [...departments].sort(([a], [b]) => comparePtBr(a, b))) summary.addRow([`   ↳ ${department}`, value.people.size, Number(value.total)]);
  }
  if (!companySum.equals(grand)) throw new Error(`Inconsistência no resumo de Café da Manhã: empresas ${companySum.toFixed(2)} ≠ total ${grand.toFixed(2)}.`);
  total(summary.addRow(["Total Geral", new Set(rows.map((row) => row.employeeId ?? row.employeeName)).size, Number(grand)]));
  summary.columns = [{ width: 42 }, { width: 16 }, { width: 20 }]; summary.getColumn(3).numFmt = MONEY;

  const detail = workbook.addWorksheet("Rateio por Colaborador");
  detail.addRow(["Empresa", "Nome", "Departamento", "Centro de custo", "Dias Úteis", "Quantidade", "Quantidade Extras", "Desconto", "Quantidade Final", "Valor Unitário", "Valor Total", "Observação"]); header(detail.getRow(1));
  for (const row of rows) detail.addRow([row.company, row.employeeName, row.department ?? "", row.costCenter ?? "", row.workingDays ?? "", row.baseQuantity ?? "", row.extraQuantity ?? "", row.discountQuantity, row.finalQuantity ?? "", row.unitPrice ? Number(row.unitPrice) : "", Number(row.amount), formatBreakfastObservation(row.observationType, row.observationDetails)]);
  total(detail.addRow(["TOTAL", "", "", "", "", "", "", "", "", "", Number(grand), ""]));
  detail.columns = [28, 34, 28, 28, 12, 14, 16, 12, 16, 16, 16, 40].map((width) => ({ width })); [10, 11].forEach((column) => { detail.getColumn(column).numFmt = MONEY; });

  const audit = workbook.addWorksheet("Auditoria");
  audit.addRows([["Competência", `${String(map.competence.month).padStart(2, "0")}/${map.competence.year}`], ["Versão", map.version], ["Lançado em", map.createdAt], ["Cadastro da obrigação", `${map.administrativeEntity.tradeName} / ${map.administrativeEntityId}`], ["Valor total", Number(map.totalAmount)], ["Feriados considerados", holidaysText(map.holidaysSnapshot)]]);
  audit.getColumn(1).font = { bold: true }; audit.getColumn(1).width = 28; audit.getColumn(2).width = 70; audit.getCell("B5").numFmt = MONEY;
  return workbook.xlsx.writeBuffer();
}

function holidaysText(snapshot: unknown) {
  if (!Array.isArray(snapshot)) return "Não registrado";
  if (!snapshot.length) return "Nenhum";
  return (snapshot as { date: string; name: string }[]).map((holiday) => `${holiday.date.split("-").reverse().join("/")} - ${holiday.name}`).join("; ");
}
