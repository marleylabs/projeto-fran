import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { formatTransitObservation } from "./calculations";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { normalizeAllocationRow } from "@/modules/accounts-payable/shared/allocation-views";
import { addAllocationViewSheets } from "@/modules/accounts-payable/shared/allocation-views-workbook";

// Montagem pura do XLSX do Mapa de Vale Transporte (sem server-only) — o download (export.ts) só serializa.

export type TransitVoucherWorkbookMap = Prisma.TransitVoucherMapGetPayload<{ include: { competence: true; administrativeEntity: true; allocations: true; issues: true } }>;
const MONEY = 'R$ #,##0.00';
function header(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAF1B1B" } }; }
function total(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }; }
const dept = (row: TransitVoucherWorkbookMap["allocations"][number]) => row.department ?? "Não informado";

export function buildTransitVoucherWorkbook(map: TransitVoucherWorkbookMap) {
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
  if (!companySum.equals(grand)) throw new Error(`Inconsistência no resumo de Vale Transporte: empresas ${companySum.toFixed(2)} ≠ total ${grand.toFixed(2)}.`);
  total(summary.addRow(["Total Geral", new Set(rows.map((row) => row.employeeId ?? row.employeeName)).size, Number(grand)]));
  summary.columns = [{ width: 42 }, { width: 16 }, { width: 20 }]; summary.getColumn(3).numFmt = MONEY;

  const detail = workbook.addWorksheet("Rateio por Colaborador");
  detail.addRow(["Empresa", "Nome", "Departamento", "Centro de custo", "Passagens por Dia", "Diferença Mês Anterior", "Descontos", "Dias Úteis", "Passagens a Receber", "Valor Unitário", "Valor Total", "Observação"]); header(detail.getRow(1));
  for (const row of rows) detail.addRow([row.company, row.employeeName, row.department ?? "", row.costCenter ?? "", row.dailyPassageQuantity ?? "", row.previousPassageDifference ?? "", row.passageDiscount ?? "", row.workingDays ?? "", row.passagesToReceive ?? (row.days ? Number(row.days) : ""), row.fareUnitPrice ? Number(row.fareUnitPrice) : "", Number(row.amount), formatTransitObservation(row.observationType, row.observationDetails)]);
  total(detail.addRow(["TOTAL", "", "", "", "", "", "", "", "", "", Number(grand), ""]));
  detail.columns = [28, 34, 28, 28, 16, 20, 12, 12, 18, 16, 16, 40].map((width) => ({ width })); [10, 11].forEach((column) => { detail.getColumn(column).numFmt = MONEY; });

  const audit = workbook.addWorksheet("Auditoria");
  audit.addRows([["Competência", `${String(map.competence.month).padStart(2, "0")}/${map.competence.year}`], ["Origem", map.originalName], ["Versão", map.version], ["Processado em", map.processedAt], ["Fornecedor / cadastro_id", `${map.administrativeEntity.tradeName} / ${map.administrativeEntityId}`], ["Valor total", Number(map.totalAmount)], ["Feriados considerados", holidaysText(map.holidaysSnapshot)]]);
  audit.getColumn(1).font = { bold: true }; audit.getColumn(1).width = 28; audit.getColumn(2).width = 70; audit.getCell("B6").numFmt = MONEY;
  if (map.issues.length) {
    const issues = workbook.addWorksheet("Pendências"); issues.addRow(["Linha", "Colaborador", "Código", "Problema"]); header(issues.getRow(1));
    for (const issue of map.issues) issues.addRow([issue.sourceRow ?? "", issue.employeeName ?? "", issue.code, issue.message]);
    issues.columns = [{ width: 10 }, { width: 30 }, { width: 24 }, { width: 70 }];
  }

  // Perspectivas de rateio + "Detalhado - Colaborador" (abas novas, ao final, sem alterar as existentes): agrupam o valor
  // salvo de cada alocação (snapshots de Empresa/Centro de Custo/Departamento) e precisam fechar com o total do mapa.
  // A base detalhada lê dias, passagens e tarifa gravados na alocação (nada é recalculado).
  addAllocationViewSheets(workbook, rows.map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: amountToCents(row.amount), source: row })), { expectedCents: amountToCents(map.totalAmount), context: "Vale Transporte", style: { header, total, moneyFormat: MONEY }, detail: {
    competence: `${String(map.competence.month).padStart(2, "0")}/${map.competence.year}`,
    columns: [
      { header: "Localidade", width: 11, value: (row) => row.source.locality },
      { header: "Fornecedor", width: 24, wrap: true, value: () => map.administrativeEntity.tradeName },
      { header: "Dias Úteis", width: 11, value: (row) => row.source.workingDays },
      { header: "Passagens por Dia", width: 15, value: (row) => row.source.dailyPassageQuantity },
      { header: "Diferença Mês Anterior", width: 18, value: (row) => row.source.previousPassageDifference },
      { header: "Descontos", width: 11, value: (row) => row.source.passageDiscount },
      { header: "Passagens a Receber", width: 17, value: (row) => row.source.passagesToReceive ?? (row.source.days ? Number(row.source.days) : null) },
      { header: "Tarifa", width: 13, numFmt: MONEY, value: (row) => (row.source.fareUnitPrice == null ? null : Number(row.source.fareUnitPrice)) },
    ],
  } });
  return workbook;
}

function holidaysText(snapshot: unknown) {
  if (!Array.isArray(snapshot)) return "Não registrado";
  if (!snapshot.length) return "Nenhum";
  return (snapshot as { date: string; name: string }[]).map((holiday) => `${holiday.date.split("-").reverse().join("/")} - ${holiday.name}`).join("; ");
}
