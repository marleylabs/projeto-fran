import ExcelJS from "exceljs";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { addAllocationViewSheets } from "@/modules/accounts-payable/shared/allocation-views-workbook";
import { normalizeAllocationRow } from "@/modules/accounts-payable/shared/allocation-views";
import { moneyToCents, type HealthPlanBeneficiary } from "./parser";

// XLSX do rateio do Plano de Saúde (puro, sem server-only): as faturas ativas de um fornecedor na competência num só
// arquivo. Base do rateio = Cobrado por titular (snapshot de empresa/CC/departamento gravado no upload). Sem CPF nem
// nome da mãe no arquivo.
type Money = { toString(): string };
export type HealthPlanWorkbookInvoice = {
  id: string; fileName: string; provider: string; obligation: string; control: string; dueDate: Date | null; contracts: unknown; plans: unknown; grossAmount: Money; totalAmount: Money; createdAt: Date;
  competence: { year: number; month: number };
  administrativeEntity: { tradeName: string };
  financialRecord: { identifier: string } | null;
  allocations: { id: string; holderName: string; employeeId: string | null; employeeName: string; company: string; companyId: string | null; department: string | null; costCenter: string | null; amount: Money; beneficiaryCount: number; beneficiaries: unknown }[];
};

const MONEY = 'R$ #,##0.00';
function header(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAF1B1B" } }; }
function total(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }; }

export function buildHealthPlanWorkbook(invoices: readonly HealthPlanWorkbookInvoice[]) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Gestão Administrativa";
  const [first] = invoices;
  const competence = `${String(first.competence.month).padStart(2, "0")}/${first.competence.year}`;
  const expectedCents = invoices.reduce((sum, invoice) => sum + amountToCents(invoice.totalAmount), 0);
  const grossCents = invoices.reduce((sum, invoice) => sum + amountToCents(invoice.grossAmount), 0);
  if (grossCents !== expectedCents) throw new Error(`Inconsistência no Plano de Saúde: Cobrado ${(expectedCents / 100).toFixed(2)} ≠ valor bruto ${(grossCents / 100).toFixed(2)}.`);
  const rows = invoices.flatMap((invoice) => invoice.allocations.map((row) => ({ ...row, invoice })));
  addIndividualSheet(workbook, rows, expectedCents);

  const faturas = workbook.addWorksheet("Faturas");
  header(faturas.addRow(["Obrigação", "Controle", "Vencimento", "Arquivo", "Operadora", "Contratos (PDF)", "Titulares", "Obrigação financeira", "Valor bruto"]));
  for (const invoice of invoices) faturas.addRow([invoice.obligation, invoice.control, invoice.dueDate, invoice.fileName, invoice.provider, (invoice.contracts as { code: string; name: string }[]).map((contract) => `${contract.code} ${contract.name}`).join("; "), invoice.allocations.length, invoice.financialRecord?.identifier ?? "", Number(invoice.grossAmount)]);
  total(faturas.addRow(["TOTAL", "", "", "", "", "", rows.length, "", grossCents / 100]));
  faturas.columns = [14, 16, 12, 34, 32, 60, 10, 18, 16].map((width) => ({ width })); faturas.getColumn(9).numFmt = MONEY; faturas.getColumn(3).numFmt = "dd/mm/yyyy";

  addAllocationViewSheets(workbook, rows.map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: amountToCents(row.amount), source: row })), { expectedCents, context: "Plano de Saúde", style: { header, total, moneyFormat: MONEY }, detail: {
    competence,
    columns: [
      { header: "Fornecedor", width: 24, wrap: true, value: () => first.administrativeEntity.tradeName },
      { header: "Obrigação (fatura)", width: 16, value: (row) => row.source.invoice.obligation },
      { header: "Localizado no cadastro", width: 14, value: (row) => (row.source.employeeId ? "Sim" : "Não") },
      { header: "Vidas", width: 8, value: (row) => row.source.beneficiaryCount },
    ],
  } });

  const people = workbook.addWorksheet("Beneficiários");
  header(people.addRow(["Titular", "Credencial", "Beneficiário", "Parentesco", "Plano", "Contrato", "Mensalidade", "Adicional", "Desconto", "Multa", "Cobrado"]));
  let peopleCents = 0;
  for (const row of [...rows].sort((a, b) => comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id))) {
    for (const item of row.beneficiaries as HealthPlanBeneficiary[]) {
      people.addRow([row.employeeName, item.credential, item.name, item.relationship, item.plan, item.contractCode, ...[item.monthlyCents, item.additionalCents, item.discountCents, item.fineCents, item.chargedCents].map((cents) => cents / 100)]);
      peopleCents += item.chargedCents;
    }
  }
  if (peopleCents !== expectedCents) throw new Error(`Inconsistência no Plano de Saúde (Beneficiários): ${(peopleCents / 100).toFixed(2)} ≠ ${(expectedCents / 100).toFixed(2)}.`);
  total(people.addRow(["TOTAL", "", "", "", "", "", "", "", "", "", peopleCents / 100]));
  people.columns = [34, 18, 34, 12, 10, 10, 14, 14, 14, 12, 14].map((width) => ({ width })); [7, 8, 9, 10, 11].forEach((column) => { people.getColumn(column).numFmt = MONEY; });
  people.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
  return workbook;
}

// Aba "Rateio Plano de Saúde" (modelo da planilha do usuário): uma linha por titular. Valor Titular / Valor do Dependente
// = Mensalidade das linhas do titular (-00) / dos dependentes; Taxa = Tx_Ad; Total Individual = Cobrado (base do rateio).
// Confere por titular Mensalidades + Adicional − Desconto + Multa = Cobrado; divergência falha a geração.
const INDIVIDUAL_HEADERS = ["EMPRESA", "NOME", "CENTRO DE CUSTO", "PLANO", "VALOR TITULAR", "QNT DEPENDENTES", "VALOR DO DEPENDENTE", "TAXA", "ADICIONAL", "TOTAL INDIVIDUAL"];
type IndividualRow = HealthPlanWorkbookInvoice["allocations"][number] & { invoice: HealthPlanWorkbookInvoice };
function addIndividualSheet(workbook: ExcelJS.Workbook, rows: readonly IndividualRow[], expectedCents: number) {
  const sheet = workbook.addWorksheet("Rateio Plano de Saúde");
  const head = sheet.addRow(INDIVIDUAL_HEADERS);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } }; head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  head.getCell(7).font = { bold: true, color: { argb: "FFFF0000" } };
  head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  const sum = (items: HealthPlanBeneficiary[], pick: (item: HealthPlanBeneficiary) => number) => items.reduce((total, item) => total + pick(item), 0);
  const lines = rows.map((row) => {
    const items = row.beneficiaries as HealthPlanBeneficiary[];
    const holder = items.filter((item) => item.credential.endsWith("-00")), dependents = items.filter((item) => !item.credential.endsWith("-00"));
    const planName = new Map((row.invoice.plans as { code: string; name: string }[]).map((plan) => [plan.code, plan.name]));
    const paid = holder.filter((item) => item.monthlyCents > 0);
    const plan = [...new Set((paid.length ? paid : holder).map((item) => planName.get(item.plan) ?? item.plan))].join(" / ");
    const cents = { holder: sum(holder, (item) => item.monthlyCents), dependents: sum(dependents, (item) => item.monthlyCents), fee: sum(items, (item) => (item.txAd ? moneyToCents(item.txAd) : 0)), additional: sum(items, (item) => item.additionalCents), total: amountToCents(row.amount) };
    if (cents.holder + cents.dependents + cents.additional - sum(items, (item) => item.discountCents) + sum(items, (item) => item.fineCents) !== cents.total) throw new Error(`Inconsistência no Plano de Saúde: valores de ${row.employeeName} não fecham com o Cobrado.`);
    return { company: row.company.trim() || "Sem empresa", name: row.employeeName, costCenter: row.costCenter?.trim() || "Sem centro de custo", plan, dependents: new Set(dependents.map((item) => item.name)).size, cents };
  }).sort((a, b) => comparePtBr(a.company, b.company) || comparePtBr(a.name, b.name));
  for (const line of lines) sheet.addRow([line.company, line.name, line.costCenter, line.plan, line.cents.holder / 100, line.dependents, line.cents.dependents / 100, line.cents.fee / 100, line.cents.additional / 100, line.cents.total / 100]);
  const totals = lines.reduce((acc, line) => ({ holder: acc.holder + line.cents.holder, dependents: acc.dependents + line.cents.dependents, fee: acc.fee + line.cents.fee, additional: acc.additional + line.cents.additional, total: acc.total + line.cents.total, people: acc.people + line.dependents }), { holder: 0, dependents: 0, fee: 0, additional: 0, total: 0, people: 0 });
  if (totals.total !== expectedCents) throw new Error(`Inconsistência no Plano de Saúde (Rateio): ${(totals.total / 100).toFixed(2)} ≠ ${(expectedCents / 100).toFixed(2)}.`);
  total(sheet.addRow(["TOTAL", lines.length, "", "", totals.holder / 100, totals.people, totals.dependents / 100, totals.fee / 100, totals.additional / 100, totals.total / 100]));
  sheet.columns = [16, 40, 28, 30, 14, 14, 16, 10, 12, 16].map((width) => ({ width }));
  [5, 7, 8, 9, 10].forEach((column) => { sheet.getColumn(column).numFmt = MONEY; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: INDIVIDUAL_HEADERS.length } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
