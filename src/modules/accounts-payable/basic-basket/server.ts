import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { dateOnlyFromDb, dateOnlyToDb } from "@/lib/date-only";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import {
  BASIC_BASKET_CALCULATION_DAYS, BasicBasketCalculationError, basicBasketContextFromPayments, basicBasketDaysInMonth, buildBasicBasketContext, calculateBasicBasketLine, calculateCurrentBasketDays,
  calculateRetroactiveDays, centsToDecimalString, mergeBasicBasketHolidays, parseMoneyToCents, type BasicBasketContext,
} from "./calculations";

// Cesta Básica — backend AUTORITATIVO: o cliente envia só insumos (empresa, Bonificação Condutor, Acordo,
// Cesta MENSAL, Observação). Pagamentos (anterior/atual), base de 30 dias e dias de direito à Cesta, Cesta paga,
// mês de referência do Retroativo e seus dias, dias retroativos, Retroativo e Total são sempre derivados aqui, com a
// Data de Admissão lida do cadastro; snapshots históricos nunca são recalculados a partir do cadastro atual.
export class BasicBasketValidationError extends Error {}
type Tx = Prisma.TransactionClient;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const OBSERVATION_MAX = 500;

function validateCompetence(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new BasicBasketValidationError("Competência inválida.");
}

// Contexto da competência (somente leitura): dias no mês, pagamento (2ª quarta-feira), feriados visuais
// (nacionais + manuais do Vale Transporte e do Café da Manhã, sem edição aqui), o contexto da Cesta/Retroativo e,
// para a prévia, a situação e os dias de cada colaborador ativo. A Data de Admissão só é devolvida quando há
// proporcionalidade (necessária para explicar o cálculo); para os demais, só a situação.
export async function getBasicBasketContext(year: number, month: number) {
  validateCompetence(year, month);
  const [transit, breakfast, employees] = await Promise.all([
    prisma.transitVoucherCompetence.findUnique({ where: { year_month: { year, month } }, select: { holidays: { select: { date: true, name: true } } } }),
    prisma.breakfastCompetence.findUnique({ where: { year_month: { year, month } }, select: { holidays: { select: { date: true, name: true } } } }),
    prisma.foodEmployee.findMany({ where: { active: true, mergedIntoId: null }, select: { id: true, admissionDate: true } }),
  ]);
  const cycle = buildBasicBasketContext(year, month);
  const holidays = mergeBasicBasketHolidays(year, month, (transit?.holidays ?? []).map((holiday) => ({ date: isoDay(holiday.date), name: holiday.name })), (breakfast?.holidays ?? []).map((holiday) => ({ date: isoDay(holiday.date), name: holiday.name })));
  const people = employees.map((employee) => {
    const admissionDate = dateOnlyFromDb(employee.admissionDate);
    const current = calculateCurrentBasketDays({ context: cycle, admissionDate }), retro = calculateRetroactiveDays({ context: cycle, admissionDate });
    const explain = current.status === "PRORATED" || current.status === "AFTER_PAYMENT" || retro.retroactiveDays > 0;
    return { employeeId: employee.id, currentStatus: current.status, currentBasketDays: current.currentBasketDays, retroactiveStatus: retro.status, retroactiveDays: retro.retroactiveDays, ...(explain ? { admissionDate } : {}) };
  });
  // daysInMonth = dias REAIS (calendário/card); calculationDays = base financeira fixa (30) usada na fórmula.
  return { year, month, daysInMonth: basicBasketDaysInMonth(year, month), calculationDays: BASIC_BASKET_CALCULATION_DAYS, ...cycle, holidays, people };
}

export async function getBasicBasketCompetence(year: number, month: number) {
  validateCompetence(year, month);
  return prisma.basicBasketCompetence.findUnique({
    where: { year_month: { year, month } },
    include: { maps: { where: { current: true, cancelledAt: null }, orderBy: { createdAt: "asc" }, include: { administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } } },
  });
}

// Padrão ATUAL por colaborador (empresa + valores). Empresa padrão inativa nunca é sugerida.
export async function getBasicBasketEmployeeConfigs() {
  const rows = await prisma.basicBasketEmployeeConfig.findMany({ select: { employeeId: true, defaultCompanyId: true, defaultCompany: { select: { active: true } }, driverBonus: true, agreementAmount: true, basketAmount: true } });
  return rows.map((row) => ({ employeeId: row.employeeId, defaultCompanyId: row.defaultCompany?.active ? row.defaultCompanyId : null, driverBonus: row.driverBonus.toFixed(2), agreementAmount: row.agreementAmount.toFixed(2), basketAmount: row.basketAmount.toFixed(2) }));
}

export type BasicBasketEntryInput = { employeeId: string; companyId: string; driverBonus: unknown; agreementAmount: unknown; basketAmount: unknown; observation?: string | null };
// basketCents = VALOR MENSAL cheio informado (vira o padrão do colaborador); o valor pago é derivado.
type ParsedEntry = { employeeId: string; companyId: string; driverBonusCents: number; agreementCents: number; basketCents: number; observation: string | null };
export const MISSING_ADMISSION_MESSAGE = "Informe a Data de Admissão do colaborador para calcular a Cesta Básica.";

function parseEntry(entry: BasicBasketEntryInput): ParsedEntry {
  if (!entry || typeof entry.employeeId !== "string" || !entry.employeeId) throw new BasicBasketValidationError("Colaborador inválido.");
  if (typeof entry.companyId !== "string" || !entry.companyId) throw new BasicBasketValidationError("Selecione uma empresa cadastrada para cada colaborador.");
  const observation = typeof entry.observation === "string" ? entry.observation.trim() : "";
  if (observation.length > OBSERVATION_MAX) throw new BasicBasketValidationError(`Observação com no máximo ${OBSERVATION_MAX} caracteres.`);
  try {
    return { employeeId: entry.employeeId, companyId: entry.companyId, driverBonusCents: parseMoneyToCents(entry.driverBonus, "Bonificação Condutor"), agreementCents: parseMoneyToCents(entry.agreementAmount, "Acordo"), basketCents: parseMoneyToCents(entry.basketAmount, "Cesta Básica"), observation: observation || null };
  } catch (error) { throw new BasicBasketValidationError(error instanceof Error ? error.message : "Valor inválido."); }
}

type EmployeeSnapshot = { id: string; officialName: string; department: string | null; costCenter: string | null; admissionDate: string | null };
type CompanySnapshot = { id: string; legalName: string; tradeName: string | null };
// Linha do lançamento: snapshot do cadastro NO MOMENTO + valores derivados pelo servidor.
function computeRow(entry: ParsedEntry, employee: EmployeeSnapshot, company: CompanySnapshot, cycle: BasicBasketContext) {
  // Sem Data de Admissão não dá para saber se recebe mês cheio, proporcional ou nada: bloqueia (sem inventar data).
  if (!employee.admissionDate) throw new BasicBasketValidationError(`${MISSING_ADMISSION_MESSAGE} (${employee.officialName})`);
  const current = calculateCurrentBasketDays({ context: cycle, admissionDate: employee.admissionDate });
  const { retroactiveDays } = calculateRetroactiveDays({ context: cycle, admissionDate: employee.admissionDate });
  let line: ReturnType<typeof calculateBasicBasketLine>;
  try { line = calculateBasicBasketLine({ driverBonusCents: entry.driverBonusCents, agreementCents: entry.agreementCents, monthlyBasketCents: entry.basketCents, currentBasketDays: current.currentBasketDays, retroactiveDays }); }
  catch (error) { throw new BasicBasketValidationError((error as BasicBasketCalculationError).message); }
  // Linha sem nenhum valor não gera obrigação; Cesta 0 com Bonificação/Acordo é permitido (sem regra que proíba).
  if (line.totalCents <= 0) throw new BasicBasketValidationError(current.status === "AFTER_PAYMENT" ? `${employee.officialName} foi admitido(a) após o pagamento desta competência: sem valor a pagar agora (receberá na próxima competência). Remova da seleção.` : `Informe ao menos um valor (Bonificação Condutor, Acordo ou Cesta Básica) para ${employee.officialName}.`);
  return {
    employeeId: employee.id, employeeName: employee.officialName,
    company: company.tradeName?.trim() || company.legalName, companyId: company.id,
    department: employee.department, costCenter: employee.costCenter,
    admissionDate: employee.admissionDate ? dateOnlyToDb(employee.admissionDate) : null,
    referenceCalculationDays: BASIC_BASKET_CALCULATION_DAYS, retroactiveDays, retroactiveEligible: retroactiveDays > 0,
    monthlyBasketAmount: centsToDecimalString(entry.basketCents), currentCalculationDays: BASIC_BASKET_CALCULATION_DAYS, currentBasketDays: current.currentBasketDays,
    driverBonus: centsToDecimalString(entry.driverBonusCents), agreementAmount: centsToDecimalString(entry.agreementCents), basketAmount: centsToDecimalString(line.payableBasketCents),

    retroactiveAmount: centsToDecimalString(line.retroactiveCents), amount: new Prisma.Decimal(centsToDecimalString(line.totalCents)),
    observation: entry.observation,
  };
}

// Conferência obrigatória: Σ linhas = Map.totalAmount = FinancialRecord.grossAmount (senão, erro — nunca corrige em silêncio).
async function syncMapTotals(tx: Tx, map: { id: string; administrativeEntityId: string; financialRecordId: string | null }, userId: string) {
  const all = await tx.basicBasketAllocation.findMany({ where: { mapId: map.id, deletedAt: null }, select: { amount: true, driverBonus: true, agreementAmount: true, basketAmount: true, retroactiveAmount: true } });
  const total = all.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
  if (all.some((row) => !row.driverBonus.add(row.agreementAmount).add(row.basketAmount).add(row.retroactiveAmount).equals(row.amount))) throw new BasicBasketValidationError("Erro de integridade: Total de uma linha diferente da soma dos componentes.");
  let financialRecordId = map.financialRecordId;
  if (financialRecordId) await tx.financialRecord.update({ where: { id: financialRecordId }, data: { grossAmount: total } });
  else financialRecordId = (await createFinancialRecordInTransaction(tx, { administrativeEntityId: map.administrativeEntityId, grossAmount: total, createdByUserId: userId })).id;
  const saved = await tx.basicBasketMap.update({ where: { id: map.id }, data: { totalRows: all.length, totalAmount: total, financialRecordId }, include: { financialRecord: true } });
  if (!saved.totalAmount.equals(total) || !saved.financialRecord?.grossAmount.equals(total)) throw new BasicBasketValidationError("Erro de integridade: total das linhas, do lançamento e da obrigação divergem.");
  return saved;
}

export async function addBasicBasketEntries(input: { year: number; month: number; administrativeEntityId: string; entries: BasicBasketEntryInput[]; userId: string }) {
  validateCompetence(input.year, input.month);
  if (!Array.isArray(input.entries) || !input.entries.length) throw new BasicBasketValidationError("Selecione ao menos um colaborador.");
  const entries = input.entries.map(parseEntry);
  const ids = entries.map((entry) => entry.employeeId);
  if (new Set(ids).size !== ids.length) throw new BasicBasketValidationError("Há colaboradores duplicados no lançamento.");
  const cycle = buildBasicBasketContext(input.year, input.month);

  return prisma.$transaction(async (tx) => {
    const [entity, employees, companies] = await Promise.all([
      tx.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId } }),
      tx.foodEmployee.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, officialName: true, department: true, costCenter: true, admissionDate: true } }),
      tx.company.findMany({ where: { id: { in: [...new Set(entries.map((entry) => entry.companyId))] }, active: true }, select: { id: true, legalName: true, tradeName: true } }),
    ]);
    if (!entity) throw new BasicBasketValidationError("Fornecedor (cadastro da obrigação) não encontrado.");
    if (employees.length !== ids.length) throw new BasicBasketValidationError("Um ou mais colaboradores não estão ativos ou não foram encontrados.");
    const employeeById = new Map(employees.map((employee) => [employee.id, { ...employee, admissionDate: dateOnlyFromDb(employee.admissionDate) }]));
    const companyById = new Map(companies.map((company) => [company.id, company]));
    if (entries.some((entry) => !companyById.has(entry.companyId))) throw new BasicBasketValidationError("Selecione uma empresa cadastrada e ativa para cada colaborador.");
    // Valida/calcula TODAS as linhas antes de qualquer escrita (erro em uma linha → nada é gravado).
    const computed = entries.map((entry) => ({ entry, row: computeRow(entry, employeeById.get(entry.employeeId)!, companyById.get(entry.companyId)!, cycle) }));

    const competence = await tx.basicBasketCompetence.upsert({ where: { year_month: { year: input.year, month: input.month } }, create: { year: input.year, month: input.month }, update: {} });
    let map = await tx.basicBasketMap.findFirst({ where: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, current: true } });
    if (map && (isoDay(map.paymentDate) !== cycle.paymentDate || isoDay(map.previousPaymentDate) !== cycle.previousPaymentDate)) throw new BasicBasketValidationError("Ciclo de pagamento do lançamento existente difere da regra atual; revise antes de adicionar.");
    if (!map) {
      const last = await tx.basicBasketMap.findFirst({ where: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId }, orderBy: { version: "desc" } });
      map = await tx.basicBasketMap.create({ data: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, createdByUserId: input.userId, version: (last?.version ?? 0) + 1, status: "READY", previousPaymentDate: dateOnlyToDb(cycle.previousPaymentDate), paymentDate: dateOnlyToDb(cycle.paymentDate), daysInMonth: basicBasketDaysInMonth(input.year, input.month), totalRows: 0, totalAmount: 0 } });
    }
    // Um colaborador entra uma vez por lançamento (mapa) da competência; repetidos são ignorados e informados.
    const existing = await tx.basicBasketAllocation.findMany({ where: { mapId: map.id, deletedAt: null, employeeId: { in: ids } }, select: { employeeId: true } });
    const duplicateIds = new Set(existing.map((row) => row.employeeId));
    const accepted = computed.filter(({ entry }) => !duplicateIds.has(entry.employeeId));
    const duplicateNames = [...duplicateIds].map((id) => employeeById.get(id!)?.officialName ?? String(id));
    if (!accepted.length) return { map: null, createdCount: 0, duplicateCount: duplicateIds.size, duplicateNames };

    const source = (await tx.basicBasketAllocation.aggregate({ where: { mapId: map.id }, _max: { sourceRow: true } }))._max.sourceRow ?? 0;
    await tx.basicBasketAllocation.createMany({ data: accepted.map(({ row }, index) => ({ ...row, mapId: map!.id, competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, sourceRow: source + index + 1, createdByUserId: input.userId })) });
    // Novo PADRÃO do colaborador (empresa + valores) para as próximas competências — mesma transação.
    // Retroativo e Observação NÃO viram padrão.
    for (const { entry } of accepted) {
      const defaults = { defaultCompanyId: entry.companyId, driverBonus: centsToDecimalString(entry.driverBonusCents), agreementAmount: centsToDecimalString(entry.agreementCents), basketAmount: centsToDecimalString(entry.basketCents) };
      await tx.basicBasketEmployeeConfig.upsert({ where: { employeeId: entry.employeeId }, create: { employeeId: entry.employeeId, ...defaults }, update: defaults });
    }
    const saved = await syncMapTotals(tx, map, input.userId);
    return { map: saved, createdCount: accepted.length, duplicateCount: duplicateIds.size, duplicateNames };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function assertFinancialPristine(record: { lifecycleState: string; paymentState: string; reconciliationState: string; accountingState: string } | null) {
  if (record && (record.lifecycleState !== "ACTIVE" || record.paymentState !== "PENDING" || record.reconciliationState !== "PENDING" || record.accountingState !== "PENDING")) throw new BasicBasketValidationError("Este lançamento já avançou no fluxo financeiro e não pode ser corrigido diretamente.");
}

// Correção: cancelamento LÓGICO da linha original + nova linha (nunca DELETE físico), mesma transação.
// Preserva os snapshots (nome, departamento, centro de custo, Data de Admissão usada e ciclo do mapa:
// pagamento anterior/atual); só Bonificação, Acordo, Cesta mensal, Observação e Empresa mudam. Cesta paga,
// Retroativo e Total são recalculados com esses snapshots — nunca com o cadastro atual. Correção não altera os padrões do colaborador.
export async function correctBasicBasketEntry(input: { mapId: string; allocationId: string; entry: BasicBasketEntryInput; reason: string; userId: string }) {
  if (!input.reason?.trim()) throw new BasicBasketValidationError("Informe o motivo da correção.");
  const entry = parseEntry(input.entry);
  return prisma.$transaction(async (tx) => {
    const map = await tx.basicBasketMap.findUnique({ where: { id: input.mapId }, include: { financialRecord: true } });
    if (!map || !map.current || map.cancelledAt) throw new BasicBasketValidationError("Lançamento ativo não encontrado.");
    assertFinancialPristine(map.financialRecord);
    const original = await tx.basicBasketAllocation.findFirst({ where: { id: input.allocationId, mapId: map.id, deletedAt: null } });
    if (!original || !original.employeeId) throw new BasicBasketValidationError("Registro não encontrado ou já cancelado.");
    if (entry.employeeId !== original.employeeId) throw new BasicBasketValidationError("A correção não pode trocar o colaborador do registro.");
    const company = entry.companyId === original.companyId ? { id: original.companyId, legalName: original.company, tradeName: null } : await tx.company.findFirst({ where: { id: entry.companyId, active: true }, select: { id: true, legalName: true, tradeName: true } });
    if (!company) throw new BasicBasketValidationError("Selecione uma empresa cadastrada e ativa.");
    const snapshot = { id: original.employeeId, officialName: original.employeeName, department: original.department, costCenter: original.costCenter, admissionDate: dateOnlyFromDb(original.admissionDate) };
    const row = computeRow(entry, snapshot, company, basicBasketContextFromPayments(isoDay(map.previousPaymentDate), isoDay(map.paymentDate)));
    const sourceRow = ((await tx.basicBasketAllocation.aggregate({ where: { mapId: map.id }, _max: { sourceRow: true } }))._max.sourceRow ?? 0) + 1;
    const replacement = await tx.basicBasketAllocation.create({ data: { ...row, mapId: map.id, competenceId: map.competenceId, administrativeEntityId: map.administrativeEntityId, sourceRow, createdByUserId: input.userId } });
    await tx.basicBasketAllocation.update({ where: { id: original.id }, data: { deletedAt: new Date(), deletedByUserId: input.userId, deletionReason: `Correção: ${input.reason.trim()} (substituído por ${replacement.id})` } });
    const saved = await syncMapTotals(tx, map, input.userId);
    return { replacementId: replacement.id, originalId: original.id, totalAmount: saved.totalAmount.toFixed(2) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
