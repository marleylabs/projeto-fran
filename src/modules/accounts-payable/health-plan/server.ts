import "server-only";
// Plano de Saúde — backend AUTORITATIVO (rotas /api/accounts-payable/health-plan/*): importa o PDF da operadora,
// cruza titular × colaborador por CPF, grava fatura + alocações por titular (snapshots de empresa/CC/departamento) e
// gera a obrigação financeira numa transação Serializable. O cancelamento fica em ../deletion-server.ts
// (cancelHealthPlanInvoice); o XLSX em workbook.ts. Valores do PDF em centavos → Prisma.Decimal só ao gravar.
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { maskCpf } from "@/lib/cpf";
import { extractPdfRows } from "@/lib/pdf/extractRows";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import { centsToDecimalString } from "@/modules/accounts-payable/breakfast/calculations";
import { HealthPlanParseError, matchContractCompany, parseHealthPlanRows, type HealthPlanBeneficiary } from "./parser";

/** Erro de negócio com mensagem pronta para o usuário; as rotas respondem HTTP 400 com ela. */
export class HealthPlanValidationError extends Error {}
/** Limite do upload (15 MB), conferido na rota POST (a tela usa o mesmo valor em MAX_FILE). */
export const MAX_HEALTH_PLAN_FILE_SIZE = 15 * 1024 * 1024;

function validateCompetence(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new HealthPlanValidationError("Competência inválida.");
}
// Centavos → Prisma.Decimal exato (via texto, sem float).
const decimal = (cents: number) => new Prisma.Decimal(centsToDecimalString(cents));
// "15/10/26" → 2026-10-15 (o PDF usa ano com 2 dígitos).
function parseDueDate(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(text);
  return match ? new Date(Date.UTC(2000 + Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : null;
}

// Linha de beneficiário devolvida à tela: sem CPF, nome da mãe e nascimento (ficam só no banco).
export type HealthPlanBeneficiaryView = Pick<HealthPlanBeneficiary, "credential" | "name" | "relationship" | "plan" | "contractCode" | "monthlyCents" | "additionalCents" | "discountCents" | "fineCents" | "chargedCents">;
const beneficiaryView = (row: HealthPlanBeneficiary): HealthPlanBeneficiaryView => ({ credential: row.credential, name: row.name, relationship: row.relationship, plan: row.plan, contractCode: row.contractCode, monthlyCents: row.monthlyCents, additionalCents: row.additionalCents, discountCents: row.discountCents, fineCents: row.fineCents, chargedCents: row.chargedCents });

// Include padrão: alocações por ordem do PDF, incluindo holderCpf/beneficiaries (omitidos por padrão pelo `omit` global
// de src/lib/db/prisma.ts) para que toView os mascare/filtre antes de sair do servidor.
const invoiceInclude = {
  administrativeEntity: true, financialRecord: true, competence: true,
  allocations: { orderBy: { sourceRow: "asc" }, omit: { holderCpf: false, beneficiaries: false } },
} as const satisfies Prisma.HealthPlanInvoiceInclude;
type InvoiceWithRows = Prisma.HealthPlanInvoiceGetPayload<{ include: typeof invoiceInclude }>;

// Leitura para a tela: CPF só mascarado e beneficiários sem dados pessoais.
function toView(invoice: InvoiceWithRows) {
  return {
    ...invoice,
    allocations: invoice.allocations.map(({ holderCpf, beneficiaries, ...row }) => ({ ...row, holderCpf: maskCpf(holderCpf), beneficiaries: (beneficiaries as HealthPlanBeneficiary[]).map(beneficiaryView) })),
  };
}
/** Formato devolvido à tela (GET e POST da rota). */
export type HealthPlanInvoiceView = ReturnType<typeof toView>;

/** Faturas ATIVAS (não canceladas) da competência, em ordem de importação, já no formato seguro para a tela. */
export async function getHealthPlanCompetence(year: number, month: number) {
  validateCompetence(year, month);
  const invoices = await prisma.healthPlanInvoice.findMany({ where: { competence: { year, month }, cancelledAt: null }, include: invoiceInclude, orderBy: { createdAt: "asc" } });
  return invoices.map(toView);
}

// Para o XLSX: faturas ativas do mesmo fornecedor na competência da fatura pedida (download único do rateio).
export async function getHealthPlanSupplierInvoices(invoiceId: string) {
  const invoice = await prisma.healthPlanInvoice.findFirst({ where: { id: invoiceId, cancelledAt: null } });
  if (!invoice) return null;
  return prisma.healthPlanInvoice.findMany({ where: { competenceId: invoice.competenceId, administrativeEntityId: invoice.administrativeEntityId, cancelledAt: null }, include: invoiceInclude, orderBy: { createdAt: "asc" } });
}

// Empresa do colaborador = empresa padrão já usada nos benefícios (Café da Manhã → Cesta Básica → Vale Transporte),
// sempre ativa. O cadastro do colaborador não tem empresa própria; sem padrão, vale a empresa do contrato no PDF.
async function defaultCompanies(tx: Prisma.TransactionClient, employeeIds: string[]) {
  const select = { employeeId: true, defaultCompany: { select: { id: true, legalName: true, tradeName: true, active: true } } } as const;
  const where = { employeeId: { in: employeeIds } };
  const [breakfast, basket, transit] = await Promise.all([tx.breakfastEmployeeConfig.findMany({ where, select }), tx.basicBasketEmployeeConfig.findMany({ where, select }), tx.transitVoucherEmployeeConfig.findMany({ where, select })]);
  const result = new Map<string, { id: string; name: string }>();
  for (const row of [...breakfast, ...basket, ...transit]) {
    const company = row.defaultCompany;
    if (company?.active && !result.has(row.employeeId)) result.set(row.employeeId, { id: company.id, name: company.tradeName?.trim() || company.legalName });
  }
  return result;
}

// Competência: a informada na tela ou, sem ela (year/month = null), o mês do vencimento da fatura.
/** Importa UM PDF: extrai linhas (PDF sem texto → erro), faz o parse com conferências e, numa transação Serializable,
 *  recusa obrigação já importada (fatura ativa com o mesmo número, em qualquer competência), cria a competência se
 *  preciso, a obrigação (FinancialRecord), a fatura e uma alocação por titular, e confere Σ alocações = total = bruto.
 *  Devolve a fatura no formato da tela (CPF mascarado). Erros: HealthPlanValidationError. */
export async function importHealthPlanInvoice(input: { year: number | null; month: number | null; administrativeEntityId: string; fileName: string; buffer: Buffer; userId: string }) {
  if (input.year !== null || input.month !== null) validateCompetence(Number(input.year), Number(input.month));
  const { pages, hasExtractableText } = await extractPdfRows(input.buffer);
  if (!hasExtractableText) throw new HealthPlanValidationError("O PDF não tem texto copiável (provável imagem escaneada).");
  let parsed;
  try { parsed = parseHealthPlanRows(pages); } catch (error) { if (error instanceof HealthPlanParseError) throw new HealthPlanValidationError(error.message); throw error; }

  const dueDate = parseDueDate(parsed.dueDate);
  if (input.year === null && !dueDate) throw new HealthPlanValidationError("Vencimento não encontrado no PDF: informe a competência.");
  const year = input.year ?? dueDate!.getUTCFullYear(), month = input.month ?? dueDate!.getUTCMonth() + 1;

  return prisma.$transaction(async (tx) => {
    const entity = await tx.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId }, select: { id: true } });
    if (!entity) throw new HealthPlanValidationError("Cadastro da obrigação não encontrado.");
    const duplicate = await tx.healthPlanInvoice.findFirst({ where: { obligation: parsed.obligation, cancelledAt: null }, include: { competence: true } });
    if (duplicate) throw new HealthPlanValidationError(`A fatura (obrigação ${parsed.obligation}) já foi importada na competência ${String(duplicate.competence.month).padStart(2, "0")}/${duplicate.competence.year}.`);

    // Titular ↔ colaborador SOMENTE por CPF normalizado (nunca por nome).
    const employees = await tx.foodEmployee.findMany({ where: { cpf: { in: parsed.holders.map((holder) => holder.cpf) } }, select: { id: true, cpf: true, officialName: true, department: true, costCenter: true } });
    const employeeByCpf = new Map(employees.map((employee) => [employee.cpf!, employee]));
    const companies = await defaultCompanies(tx, employees.map((employee) => employee.id));
    const activeCompanies = await tx.company.findMany({ where: { active: true }, select: { id: true, legalName: true, tradeName: true, active: true } });
    const contractCompany = new Map(parsed.contracts.map((contract) => {
      const company = matchContractCompany(contract.name, activeCompanies);
      return [contract.code, company ? { id: company.id, name: company.tradeName?.trim() || company.legalName } : undefined] as const;
    }));

    const competence = await tx.healthPlanCompetence.upsert({ where: { year_month: { year, month } }, create: { year, month }, update: {} });
    const total = decimal(parsed.totalCents);
    const financialRecord = await createFinancialRecordInTransaction(tx, { administrativeEntityId: input.administrativeEntityId, grossAmount: total, createdByUserId: input.userId });
    const invoice = await tx.healthPlanInvoice.create({ data: {
      competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, createdByUserId: input.userId, financialRecordId: financialRecord.id,
      fileName: input.fileName.slice(0, 255), provider: parsed.provider, obligation: parsed.obligation, control: parsed.control, dueDate,
      contracts: parsed.contracts, plans: parsed.plans, grossAmount: decimal(parsed.grossCents), totalAmount: total,
      holderCount: parsed.holders.length, beneficiaryCount: parsed.holders.reduce((sum, holder) => sum + holder.beneficiaries.length, 0),
    } });
    await tx.healthPlanAllocation.createMany({ data: parsed.holders.map((holder, index) => {
      const employee = employeeByCpf.get(holder.cpf);
      // Titular não localizado continua Sem empresa (decisão do usuário); localizado sem padrão usa o contrato do PDF.
      const company = employee ? companies.get(employee.id) ?? contractCompany.get(holder.beneficiaries[0].contractCode) : undefined;
      return {
        invoiceId: invoice.id, competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, sourceRow: index + 1,
        holderCpf: holder.cpf, holderName: holder.name, employeeId: employee?.id ?? null, employeeName: employee?.officialName ?? holder.name,
        company: company?.name ?? "", companyId: company?.id ?? null, department: employee?.department || null, costCenter: employee?.costCenter || null,
        amount: decimal(holder.chargedCents), beneficiaryCount: holder.beneficiaries.length, beneficiaries: holder.beneficiaries,
      };
    }) });
    // Defesa: Σ titulares = Cobrado = Valor Bruto = obrigação.
    const sum = (await tx.healthPlanAllocation.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } }))._sum.amount ?? new Prisma.Decimal(0);
    if (!sum.equals(total) || !total.equals(invoice.grossAmount)) throw new HealthPlanValidationError("Erro de integridade: soma dos titulares difere do valor bruto da fatura.");
    return toView(await tx.healthPlanInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: invoiceInclude }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
