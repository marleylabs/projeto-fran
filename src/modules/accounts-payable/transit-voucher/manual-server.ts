import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import {
  DEFAULT_FARE_UNIT_PRICE, TransitVoucherCalculationError, assertPassagesToReceive, calculatePassagesToReceive,
  calculateTransitVoucherEmployeeTotal, centsToDecimalString, parseFareToCents, summarizeCompetenceDays,
  type TransitObservationKind,
} from "./calculations";
import { TransitVoucherValidationError } from "./server";
import { getBrazilianNationalHolidays, getEffectiveTransitVoucherHolidays, toHolidaySnapshot } from "./holidays";

type Tx = Prisma.TransactionClient;

function validateCompetence(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new TransitVoucherValidationError("Competência inválida.");
}
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function parseHolidayDate(value: unknown, year: number, month: number) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TransitVoucherValidationError("Data do feriado inválida.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) throw new TransitVoucherValidationError("A data do feriado deve pertencer à competência.");
  return date;
}
const holidayName = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) throw new TransitVoucherValidationError("Informe o nome do feriado.");
  return value.trim().slice(0, 120);
};
async function ensureCompetence(tx: Tx, year: number, month: number) {
  return tx.transitVoucherCompetence.upsert({ where: { year_month: { year, month } }, create: { year, month }, update: {} });
}
const fareOf = (competence: { fareUnitPrice: Prisma.Decimal | null } | null) => (competence?.fareUnitPrice ?? new Prisma.Decimal(DEFAULT_FARE_UNIT_PRICE)).toFixed(2);

// Leitura pura (não cria competência): tarifa (padrão R$ 4,20 até ser definida), feriados e dias úteis.
export async function getTransitVoucherContext(year: number, month: number) {
  validateCompetence(year, month);
  const competence = await prisma.transitVoucherCompetence.findUnique({ where: { year_month: { year, month } }, include: { holidays: { orderBy: { date: "asc" } } } });
  const effective = getEffectiveTransitVoucherHolidays(year, month, (competence?.holidays ?? []).map((holiday) => ({ id: holiday.id, date: isoDay(holiday.date), name: holiday.name })));
  const holidays = effective.map((holiday) => ({ date: holiday.date, name: holiday.name, source: holiday.source, editable: holiday.source === "MANUAL", manualName: holiday.manualName ?? null }));
  return { year, month, fareUnitPrice: fareOf(competence), fareDefined: Boolean(competence?.fareUnitPrice), holidays, ...summarizeCompetenceDays(year, month, holidays.map((holiday) => holiday.date)) };
}

export async function setTransitVoucherFare(year: number, month: number, fare: string | number) {
  validateCompetence(year, month);
  let cents: number;
  try { cents = parseFareToCents(fare); } catch (error) { throw new TransitVoucherValidationError(error instanceof Error ? error.message : "Valor da passagem inválido."); }
  await prisma.$transaction((tx) => tx.transitVoucherCompetence.upsert({ where: { year_month: { year, month } }, create: { year, month, fareUnitPrice: centsToDecimalString(cents) }, update: { fareUnitPrice: centsToDecimalString(cents) } }));
  return getTransitVoucherContext(year, month);
}

export async function saveTransitVoucherHoliday(input: { year: number; month: number; date: unknown; name: unknown; userId: string }) {
  validateCompetence(input.year, input.month);
  const date = parseHolidayDate(input.date, input.year, input.month);
  const name = holidayName(input.name);
  if (getBrazilianNationalHolidays(input.year).some((holiday) => holiday.date === isoDay(date))) throw new TransitVoucherValidationError("Esta data já é um feriado nacional automático e não precisa ser cadastrada.");
  await prisma.$transaction(async (tx) => {
    const competence = await ensureCompetence(tx, input.year, input.month);
    await tx.transitVoucherHoliday.upsert({ where: { competenceId_date: { competenceId: competence.id, date } }, create: { competenceId: competence.id, date, name, createdByUserId: input.userId }, update: { name } });
  });
  return getTransitVoucherContext(input.year, input.month);
}

export async function removeTransitVoucherHoliday(year: number, month: number, date: unknown) {
  validateCompetence(year, month);
  const parsed = parseHolidayDate(date, year, month);
  const competence = await prisma.transitVoucherCompetence.findUnique({ where: { year_month: { year, month } } });
  const manualExists = competence ? Boolean(await prisma.transitVoucherHoliday.findFirst({ where: { competenceId: competence.id, date: parsed } })) : false;
  if (!manualExists && getBrazilianNationalHolidays(year).some((holiday) => holiday.date === isoDay(parsed))) throw new TransitVoucherValidationError("Feriado nacional automático não pode ser removido.");
  if (competence) await prisma.transitVoucherHoliday.deleteMany({ where: { competenceId: competence.id, date: parsed } });
  return getTransitVoucherContext(year, month);
}

export async function getTransitVoucherEmployeeConfigs() {
  // Padrão ATUAL do colaborador (preferência). Empresa padrão inativa nunca é sugerida (vem como null + flag).
  const rows = await prisma.transitVoucherEmployeeConfig.findMany({ select: { employeeId: true, dailyPassageQuantity: true, defaultCompanyId: true, defaultCompany: { select: { active: true } } } });
  return rows.map((row) => ({ employeeId: row.employeeId, dailyPassageQuantity: row.dailyPassageQuantity, defaultCompanyId: row.defaultCompany?.active ? row.defaultCompanyId : null, defaultCompanyUnavailable: Boolean(row.defaultCompanyId && !row.defaultCompany?.active) }));
}

export type TransitVoucherEntryInput = {
  employeeId: string;
  companyId: string;
  dailyPassageQuantity: number;
  previousPassageDifference: number;
  passageDiscount: number;
  observationType?: TransitObservationKind | null;
  observationDetails?: string | null;
};

const normalizedKey = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

function validateEntryShape(entry: TransitVoucherEntryInput) {
  if (typeof entry.employeeId !== "string" || !entry.employeeId) throw new TransitVoucherValidationError("Colaborador inválido.");
  // A empresa vem SEMPRE do cadastro mestre (Company): id obrigatório; texto livre nunca é aceito.
  if (typeof entry.companyId !== "string" || !entry.companyId) throw new TransitVoucherValidationError("Selecione uma empresa cadastrada para cada colaborador.");
  for (const [value, label] of [[entry.dailyPassageQuantity, "Passagem por dia"], [entry.previousPassageDifference, "Diferença do mês anterior"], [entry.passageDiscount, "Descontos"]] as const) {
    if (!Number.isInteger(value)) throw new TransitVoucherValidationError(`${label} deve ser um número inteiro.`);
  }
  if (entry.dailyPassageQuantity < 1) throw new TransitVoucherValidationError("Passagem por dia deve ser no mínimo 1.");
  if (entry.passageDiscount < 0) throw new TransitVoucherValidationError("Descontos não pode ser negativo.");
  if (entry.observationType && entry.observationType !== "VACATION" && entry.observationType !== "OTHER") throw new TransitVoucherValidationError("Tipo de observação inválido.");
  if (entry.observationType === "OTHER" && !entry.observationDetails?.trim()) throw new TransitVoucherValidationError("Informe o detalhe da observação.");
}

type EmployeeRef = { id: string; officialName: string; department: string; costCenter: string };
type CompanyRef = { id: string; legalName: string; tradeName: string | null };
// Linha do lançamento: tudo derivado no backend; o nome da empresa é o snapshot do cadastro mestre NO MOMENTO.
function computeEntryRow(entry: TransitVoucherEntryInput, employee: EmployeeRef, company: CompanyRef, workingDays: number, fareCents: number) {
  const passages = calculatePassagesToReceive(workingDays, entry.previousPassageDifference, entry.passageDiscount);
  try { assertPassagesToReceive(passages, employee.officialName); } catch (error) { throw new TransitVoucherValidationError((error as TransitVoucherCalculationError).message); }
  const totalCents = calculateTransitVoucherEmployeeTotal(fareCents, entry.dailyPassageQuantity, passages);
  if (totalCents <= 0) throw new TransitVoucherValidationError(`${employee.officialName}: o valor total deve ser maior que zero.`);
  return {
    sourceIdentifier: employee.id, employeeId: employee.id,
    company: company.tradeName?.trim() || company.legalName, companyId: company.id,
    employeeName: employee.officialName, originalEmployeeName: employee.officialName,
    department: employee.department, costCenter: employee.costCenter,
    dailyPassageQuantity: entry.dailyPassageQuantity, previousPassageDifference: entry.previousPassageDifference, passageDiscount: entry.passageDiscount,
    workingDays, passagesToReceive: passages, fareUnitPrice: centsToDecimalString(fareCents),
    days: new Prisma.Decimal(passages), dailyAmount: new Prisma.Decimal(centsToDecimalString(fareCents * entry.dailyPassageQuantity)),
    observationType: entry.observationType ?? null, observationDetails: entry.observationDetails?.trim() || null,
    amount: new Prisma.Decimal(centsToDecimalString(totalCents)), origin: "MANUAL" as const,
  };
}

// O backend RECALCULA tudo (dias úteis, a receber, total, totais por empresa/departamento) — o
// frontend só envia insumos; nenhum valor monetário do cliente é aceito.
export async function addTransitVoucherEntries(input: { year: number; month: number; administrativeEntityId: string; entries: TransitVoucherEntryInput[]; userId: string }) {
  validateCompetence(input.year, input.month);
  if (!Array.isArray(input.entries) || !input.entries.length) throw new TransitVoucherValidationError("Selecione ao menos um colaborador.");
  const ids = input.entries.map((entry) => entry.employeeId);
  if (new Set(ids).size !== ids.length) throw new TransitVoucherValidationError("Há colaboradores duplicados no lançamento.");
  for (const entry of input.entries) validateEntryShape(entry);

  return prisma.$transaction(async (tx) => {
    const [entity, employees, companies] = await Promise.all([
      tx.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId } }),
      tx.foodEmployee.findMany({ where: { id: { in: ids }, active: true } }),
      tx.company.findMany({ where: { id: { in: [...new Set(input.entries.map((entry) => entry.companyId))] }, active: true } }),
    ]);
    if (!entity) throw new TransitVoucherValidationError("Cadastro da obrigação não encontrado.");
    if (employees.length !== ids.length) throw new TransitVoucherValidationError("Um ou mais colaboradores não estão ativos ou não foram encontrados.");
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const companyById = new Map(companies.map((company) => [company.id, company]));
    if (input.entries.some((entry) => !companyById.has(entry.companyId))) throw new TransitVoucherValidationError("Selecione uma empresa cadastrada para cada colaborador.");

    await ensureCompetence(tx, input.year, input.month);
    const competence = await tx.transitVoucherCompetence.findUniqueOrThrow({ where: { year_month: { year: input.year, month: input.month } }, include: { holidays: true } });
    const currentFareCents = parseFareToCents(fareOf(competence));
    // Feriados efetivos = nacionais (código) + manuais; só um NOVO mapa (ou mapa sem registros) usa isto.
    const currentHolidays = toHolidaySnapshot(getEffectiveTransitVoucherHolidays(input.year, input.month, competence.holidays.map((holiday) => ({ id: holiday.id, date: isoDay(holiday.date), name: holiday.name }))));
    const currentWorkingDays = summarizeCompetenceDays(input.year, input.month, currentHolidays.map((holiday) => holiday.date)).workingDays;

    let map = await tx.transitVoucherMap.findFirst({ where: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, current: true, originalName: "Lançamentos manuais" } });
    // O MAPA é a fonte histórica: tarifa e dias úteis vêm dos registros ativos dele e os feriados do holidaysSnapshot.
    // A configuração atual da competência só vale para um mapa novo (ou sem registros ativos).
    const baseRow = map ? await tx.transitVoucherAllocation.findFirst({ where: { mapId: map.id, deletedAt: null, workingDays: { not: null }, fareUnitPrice: { not: null } }, orderBy: { sourceRow: "asc" } }) : null;
    const fareCents = baseRow ? parseFareToCents(baseRow.fareUnitPrice!.toFixed(2)) : currentFareCents;
    const workingDays = baseRow ? baseRow.workingDays! : currentWorkingDays;
    const holidaysSnapshot = baseRow ? (map!.holidaysSnapshot ?? undefined) : currentHolidays;
    // Persiste o valor efetivo da tarifa na competência (snapshot para novos mapas).
    if (!competence.fareUnitPrice) await tx.transitVoucherCompetence.update({ where: { id: competence.id }, data: { fareUnitPrice: centsToDecimalString(currentFareCents) } });
    if (map && !baseRow) map = await tx.transitVoucherMap.update({ where: { id: map.id }, data: { holidaysSnapshot: currentHolidays } });
    if (!map) {
      const last = await tx.transitVoucherMap.findFirst({ where: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId }, orderBy: { version: "desc" } });
      map = await tx.transitVoucherMap.create({ data: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, uploadedByUserId: input.userId, version: (last?.version ?? 0) + 1, status: "READY", originalName: "Lançamentos manuais", storageKey: `manual/transit/${competence.id}/${input.administrativeEntityId}/v${(last?.version ?? 0) + 1}`, mimeType: "application/x-manual-entry", sizeBytes: 0, holidaysSnapshot, sha256: `manual-${competence.id}-${input.administrativeEntityId}-v${(last?.version ?? 0) + 1}`, totalRows: 0, validRows: 0, invalidRows: 0, totalAmount: 0 } });
    }

    const existing = await tx.transitVoucherAllocation.findMany({ where: { mapId: map.id, deletedAt: null, employeeId: { in: ids } }, select: { employeeId: true } });
    const duplicateIds = new Set(existing.map((row) => row.employeeId));
    const accepted = input.entries.filter((entry) => !duplicateIds.has(entry.employeeId));
    if (!accepted.length) return { map: null, createdCount: 0, duplicateCount: duplicateIds.size, duplicateNames: [...duplicateIds].map((id) => employeeById.get(id!)?.officialName ?? id) };

    const source = (await tx.transitVoucherAllocation.aggregate({ where: { mapId: map.id }, _max: { sourceRow: true } }))._max.sourceRow ?? 0;
    const rows = accepted.map((entry, index) => ({
      ...computeEntryRow(entry, employeeById.get(entry.employeeId)!, companyById.get(entry.companyId)!, workingDays, fareCents),
      mapId: map!.id, competenceId: competence.id, administrativeEntityId: input.administrativeEntityId,
      sourceRow: source + index + 1, createdByUserId: input.userId,
    }));
    await tx.transitVoucherAllocation.createMany({ data: rows });

    // Padrão do colaborador (só para PRÓXIMOS lançamentos; nunca relido para recalcular histórico).
    // Empresa já validada (ativa, cadastro mestre) acima; o padrão é atualizado na MESMA transação do lançamento.
    for (const entry of accepted) await tx.transitVoucherEmployeeConfig.upsert({ where: { employeeId: entry.employeeId }, create: { employeeId: entry.employeeId, dailyPassageQuantity: entry.dailyPassageQuantity, defaultCompanyId: entry.companyId }, update: { dailyPassageQuantity: entry.dailyPassageQuantity, defaultCompanyId: entry.companyId } });

    const all = await tx.transitVoucherAllocation.findMany({ where: { mapId: map.id, deletedAt: null }, select: { amount: true, company: true, department: true } });
    const total = all.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
    const group = (key: (row: (typeof all)[number]) => string) => [...all.reduce((groups, row) => groups.set(key(row), (groups.get(key(row)) ?? new Prisma.Decimal(0)).add(row.amount)), new Map<string, Prisma.Decimal>()).values()].reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
    if (!group((row) => normalizedKey(row.company)).equals(total) || !group((row) => `${normalizedKey(row.company)}|${normalizedKey(row.department ?? "")}`).equals(total)) {
      throw new TransitVoucherValidationError("Erro de integridade no rateio: colaborador, departamento, empresa e total geral divergem.");
    }

    let financialRecordId = map.financialRecordId;
    if (financialRecordId) await tx.financialRecord.update({ where: { id: financialRecordId }, data: { grossAmount: total } });
    else financialRecordId = (await createFinancialRecordInTransaction(tx, { administrativeEntityId: input.administrativeEntityId, grossAmount: total, createdByUserId: input.userId })).id;
    await tx.transitVoucherMap.update({ where: { id: map.id }, data: { totalRows: all.length, validRows: all.length, totalAmount: total, financialRecordId } });
    const saved = await tx.transitVoucherMap.findUniqueOrThrow({ where: { id: map.id }, include: { administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } });
    return { map: saved, createdCount: accepted.length, duplicateCount: duplicateIds.size, duplicateNames: [...duplicateIds].map((id) => employeeById.get(id!)?.officialName ?? id) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function assertFinancialPristine(record: { lifecycleState: string; paymentState: string; reconciliationState: string; accountingState: string } | null) {
  if (record && (record.lifecycleState !== "ACTIVE" || record.paymentState !== "PENDING" || record.reconciliationState !== "PENDING" || record.accountingState !== "PENDING")) {
    throw new TransitVoucherValidationError("Este lançamento já avançou no fluxo financeiro e não pode ser corrigido diretamente.");
  }
}

// Correção de lançamento concluído: cancelamento LÓGICO do registro original + novo registro, na mesma transação
// (nunca DELETE físico). O original guarda quem/quando/motivo e o id do substituto; o FinancialRecord existente
// é atualizado para o novo Total Geral (mesmo padrão de editTransitVoucherMap / recalculateTransitMap).
// Por padrão PRESERVA os snapshots do registro original (tarifa, dias úteis, empresa, departamento, centro de custo e
// feriados do mapa); só campos alterados explicitamente (passagens, diferença, desconto, empresa, observação) mudam.
export async function correctTransitVoucherEntry(input: { mapId: string; allocationId: string; entry: TransitVoucherEntryInput; reason: string; userId: string }) {
  if (!input.reason?.trim()) throw new TransitVoucherValidationError("Informe o motivo da correção.");
  validateEntryShape(input.entry);
  return prisma.$transaction(async (tx) => {
    const map = await tx.transitVoucherMap.findUnique({ where: { id: input.mapId }, include: { financialRecord: true } });
    if (!map || !map.current || map.cancelledAt) throw new TransitVoucherValidationError("Lançamento ativo não encontrado.");
    assertFinancialPristine(map.financialRecord);
    const original = await tx.transitVoucherAllocation.findFirst({ where: { id: input.allocationId, mapId: map.id, deletedAt: null } });
    if (!original) throw new TransitVoucherValidationError("Registro não encontrado ou já cancelado.");
    if (original.passagesToReceive === null) throw new TransitVoucherValidationError("Registros importados antes desta versão não são corrigidos por este fluxo.");

    if (input.entry.employeeId !== original.employeeId) throw new TransitVoucherValidationError("A correção não pode trocar o colaborador do registro.");
    const companyChanged = input.entry.companyId !== original.companyId;
    const [employee, company, clash] = await Promise.all([
      tx.foodEmployee.findFirst({ where: { id: input.entry.employeeId } }),
      companyChanged ? tx.company.findFirst({ where: { id: input.entry.companyId, active: true } }) : Promise.resolve({ id: original.companyId!, legalName: original.company, tradeName: null }),
      tx.transitVoucherAllocation.findFirst({ where: { mapId: map.id, deletedAt: null, employeeId: input.entry.employeeId, NOT: { id: original.id } } }),
    ]);
    if (!employee) throw new TransitVoucherValidationError("Colaborador não encontrado.");
    if (!company) throw new TransitVoucherValidationError("Selecione uma empresa cadastrada e ativa.");
    if (clash) throw new TransitVoucherValidationError("Este colaborador já possui outro registro ativo nesta competência.");

    if (original.workingDays === null || original.fareUnitPrice === null || original.companyId === null) throw new TransitVoucherValidationError("Registro sem snapshot completo não é corrigido por este fluxo.");
    const fareCents = parseFareToCents(original.fareUnitPrice.toFixed(2));
    const snapshotEmployee = { id: employee.id, officialName: original.employeeName, department: original.department ?? employee.department, costCenter: original.costCenter ?? employee.costCenter };
    const row = computeEntryRow(input.entry, snapshotEmployee, company, original.workingDays, fareCents);
    const sourceRow = ((await tx.transitVoucherAllocation.aggregate({ where: { mapId: map.id }, _max: { sourceRow: true } }))._max.sourceRow ?? 0) + 1;
    const replacement = await tx.transitVoucherAllocation.create({ data: { ...row, mapId: map.id, competenceId: map.competenceId, administrativeEntityId: map.administrativeEntityId, sourceRow, createdByUserId: input.userId } });
    await tx.transitVoucherAllocation.update({ where: { id: original.id }, data: { deletedAt: new Date(), deletedByUserId: input.userId, deletionReason: `Correção: ${input.reason.trim()} (substituído por ${replacement.id})` } });
    // Empresa padrão só muda se a empresa foi alterada EXPLICITAMENTE; snapshot histórico nunca reverte o padrão atual.
    await tx.transitVoucherEmployeeConfig.upsert({ where: { employeeId: employee.id }, create: { employeeId: employee.id, dailyPassageQuantity: input.entry.dailyPassageQuantity, ...(companyChanged ? { defaultCompanyId: input.entry.companyId } : {}) }, update: { dailyPassageQuantity: input.entry.dailyPassageQuantity, ...(companyChanged ? { defaultCompanyId: input.entry.companyId } : {}) } });

    const aggregate = await tx.transitVoucherAllocation.aggregate({ where: { mapId: map.id, deletedAt: null }, _sum: { amount: true }, _count: true });
    const total = aggregate._sum.amount ?? new Prisma.Decimal(0);
    if (map.financialRecordId) await tx.financialRecord.update({ where: { id: map.financialRecordId }, data: { grossAmount: total } });
    await tx.transitVoucherMap.update({ where: { id: map.id }, data: { totalRows: aggregate._count, validRows: aggregate._count, totalAmount: total } });
    return { replacementId: replacement.id, originalId: original.id, totalAmount: total.toFixed(2) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
