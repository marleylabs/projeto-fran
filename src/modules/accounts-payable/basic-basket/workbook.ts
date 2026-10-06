import ExcelJS from "exceljs";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { dateOnlyFromDb, dateOnlyToDb, formatDateOnlyBR } from "@/lib/date-only";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { groupBasicBasketByCompanyCostCenter, sumBasicBasket, type BasicBasketRateioRow } from "./rateio";
import { BASIC_BASKET_CALCULATION_DAYS, basicBasketContextFromPayments } from "./calculations";

// XLSX da Cesta Básica (montagem pura; o download só serializa): Detalhado, Resumo (Empresa → Centro de
// Custo) e Auditoria. Valores monetários numéricos; Data de Admissão como célula de data real.
type Numeric = { toString(): string } | string | number;
export type BasicBasketWorkbookMap = {
  version: number; createdAt: Date; previousPaymentDate: Date | string; paymentDate: Date | string; daysInMonth: number; totalAmount: Numeric;
  competence: { year: number; month: number };
  administrativeEntity: { tradeName: string; legalName?: string | null };
  financialRecord?: { identifier: string; grossAmount: Numeric } | null;
  allocations: Array<BasicBasketRateioRow & { admissionDate: Date | string | null; monthlyBasketAmount: Numeric; currentCalculationDays: number; currentBasketDays: number; referenceCalculationDays: number; retroactiveDays: number; observation: string | null }>;
};

const MONEY = 'R$ #,##0.00';
function header(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAF1B1B" } }; }
function total(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }; }
const money = (cents: number) => cents / 100;

export function buildBasicBasketWorkbook(map: BasicBasketWorkbookMap, generatedBy?: string) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Gestão Administrativa";
  const supplier = map.administrativeEntity.tradeName;
  const rows = [...map.allocations].sort((a, b) => comparePtBr(a.company, b.company) || comparePtBr(a.department, b.department) || comparePtBr(a.employeeName, b.employeeName));
  const totals = sumBasicBasket(rows);
  const mapCents = amountToCents(map.totalAmount);
  if (totals.totalCents !== mapCents || (map.financialRecord && amountToCents(map.financialRecord.grossAmount) !== mapCents)) throw new Error(`Inconsistência na Cesta Básica: linhas ${money(totals.totalCents).toFixed(2)}, lançamento ${money(mapCents).toFixed(2)}.`);

  const detail = workbook.addWorksheet("Detalhado");
  // Cálculo auditável: valor mensal → dias de direito na competência → Cesta paga; mês anterior → dias retroativos → Retroativo.
  detail.addRow(["Empresa", "Departamento", "Centro de Custo", "Colaborador", "Data de Admissão", "Pagamento Anterior", "Pagamento Atual", "Valor Mensal da Cesta", "Base de Cálculo da Cesta", "Dias de Direito à Cesta", "Mês de Referência Retroativo", "Base de Cálculo Retroativo", "Dias Retroativos", "Bonificação Condutor", "Acordo", "Cesta Paga", "Retroativo", "Total", "Observação", "Fornecedor"]); header(detail.getRow(1));
  const previousPayment = dateOnlyToDb(dateOnlyFromDb(map.previousPaymentDate)!), currentPayment = dateOnlyToDb(dateOnlyFromDb(map.paymentDate)!);
  const reference = basicBasketContextFromPayments(dateOnlyFromDb(map.previousPaymentDate)!, dateOnlyFromDb(map.paymentDate)!);
  const referenceLabel = `${String(reference.referenceMonth).padStart(2, "0")}/${reference.referenceYear}`;
  for (const row of rows) {
    const admission = dateOnlyFromDb(row.admissionDate);
    detail.addRow([row.company, row.department ?? "", row.costCenter ?? "", row.employeeName, admission ? dateOnlyToDb(admission) : null, previousPayment, currentPayment, money(amountToCents(row.monthlyBasketAmount)), row.currentCalculationDays, row.currentBasketDays, referenceLabel, row.referenceCalculationDays, row.retroactiveDays, money(amountToCents(row.driverBonus)), money(amountToCents(row.agreementAmount)), money(amountToCents(row.basketAmount)), money(amountToCents(row.retroactiveAmount)), money(amountToCents(row.amount)), row.observation ?? "", supplier]);
  }
  total(detail.addRow(["TOTAL", "", "", "", null, null, null, null, null, null, "", null, null, money(totals.driverBonusCents), money(totals.agreementCents), money(totals.basketCents), money(totals.retroactiveCents), money(totals.totalCents), "", ""]));
  detail.columns = [24, 24, 26, 34, 16, 18, 16, 18, 14, 16, 18, 16, 14, 20, 14, 14, 14, 16, 40, 24].map((width) => ({ width }));
  [5, 6, 7].forEach((column) => { detail.getColumn(column).numFmt = "dd/mm/yyyy"; }); [8, 14, 15, 16, 17, 18].forEach((column) => { detail.getColumn(column).numFmt = MONEY; });
  detail.views = [{ state: "frozen", ySplit: 1 }];

  const resumo = groupBasicBasketByCompanyCostCenter(rows);
  if (!resumo.consistent) throw new Error("Inconsistência no resumo da Cesta Básica: empresas, centros de custo e total divergem.");
  const summary = workbook.addWorksheet("Resumo");
  summary.addRow(["Empresa", "Centro de Custo", "Colaboradores", "Bonificação Condutor", "Acordo", "Cesta Paga", "Retroativo", "Total"]); header(summary.getRow(1));
  const line = (label: [string, string], value: typeof totals) => [...label, value.people, money(value.driverBonusCents), money(value.agreementCents), money(value.basketCents), money(value.retroactiveCents), money(value.totalCents)];
  for (const company of resumo.companies) {
    summary.addRow(line([company.company, ""], company.totals)).font = { bold: true };
    for (const costCenter of company.costCenters) summary.addRow(line(["", costCenter.costCenter], costCenter.totals));
  }
  total(summary.addRow(line(["Total Geral", ""], resumo.totals)));
  summary.columns = [26, 30, 14, 20, 14, 14, 14, 16].map((width) => ({ width })); [4, 5, 6, 7, 8].forEach((column) => { summary.getColumn(column).numFmt = MONEY; });

  const audit = workbook.addWorksheet("Auditoria");
  const competence = `${String(map.competence.month).padStart(2, "0")}/${map.competence.year}`;
  audit.addRows([
    ["Competência", competence], ["Dias no mês (calendário)", map.daysInMonth], ["Pagamento anterior (2ª quarta-feira)", formatDateOnlyBR(map.previousPaymentDate)], ["Data de pagamento (2ª quarta-feira)", formatDateOnlyBR(map.paymentDate)],
    ["Mês de referência do Retroativo", `${String(reference.referenceMonth).padStart(2, "0")}/${reference.referenceYear} (${formatDateOnlyBR(reference.referenceMonthStart)} a ${formatDateOnlyBR(reference.referenceMonthEnd)})`],
    ["Fornecedor", supplier], ["Versão do lançamento", map.version], ["Lançado em", map.createdAt],
    ["Obrigação", map.financialRecord?.identifier ?? "—"], ["Total Geral", money(mapCents)], ["Colaboradores", totals.people],
    ["Base de cálculo", `Os cálculos de Cesta Básica e Retroativo utilizam base financeira fixa de ${BASIC_BASKET_CALCULATION_DAYS} dias, independentemente da quantidade de dias do mês calendário.`],
    ["Regra da Cesta da competência", "Admitidos até o 1º dia da competência: valor mensal integral (30 de 30). Admitidos depois do 1º dia e até o pagamento: valor mensal × (30 − dia da admissão + 1) ÷ 30 (dia 31 conta como dia 30). Admitidos após o pagamento: R$ 0,00 (recebem na próxima competência)."],
    ["Regra do Retroativo", "Admitidos depois do pagamento anterior e ainda no mês anterior: valor mensal × (30 − dia da admissão + 1) ÷ 30 (dia 31 conta como dia 30); centavos com arredondamento comercial. Total = Bonificação + Acordo + Cesta paga + Retroativo."],
    ["Gerado em", new Date()], ["Gerado por", generatedBy ?? "—"],
  ]);
  audit.getColumn(1).font = { bold: true }; audit.getColumn(1).width = 36; audit.getColumn(2).width = 80; audit.getCell("B10").numFmt = MONEY;
  return workbook;
}
