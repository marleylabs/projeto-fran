import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import { organizationalComparisonKey } from "@/lib/organizational-label";
import { summarizeCompetenceDays } from "@/modules/shared/calendar";
import { getBrazilianNationalHolidays, getEffectiveHolidays, toHolidaySnapshot } from "@/modules/shared/holidays";
import {
  BREAKFAST_ALLOWED_DEPARTMENT, DEFAULT_UNIT_PRICE, BreakfastCalculationError, calculateBreakfastEmployeeTotal, calculateFinalQuantity,
  centsToDecimalString, parseUnitPriceToCents, type BreakfastObservationKind,
} from "./calculations";
import { BreakfastValidationError } from "./server";

type Tx = Prisma.TransactionClient;

function validateCompetence(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new BreakfastValidationError("Competência inválida.");
}
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function parseHolidayDate(value: unknown, year: number, month: number) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BreakfastValidationError("Data do feriado inválida.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) throw new BreakfastValidationError("A data do feriado deve pertencer à competência.");
  return date;
}
const holidayName = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) throw new BreakfastValidationError("Informe o nome do feriado.");
  return value.trim().slice(0, 120);
};
async function ensureCompetence(tx: Tx, year: number, month: number) {
  return tx.breakfastCompetence.upsert({ where: { year_month: { year, month } }, create: { year, month }, update: {} });
}
const unitPriceOf = (competence: { unitPrice: Prisma.Decimal | null } | null) => (competence?.unitPrice ?? new Prisma.Decimal(DEFAULT_UNIT_PRICE)).toFixed(2);

// Leitura pura (não cria competência): valor unitário (padrão R$ 12,50 até ser definido), feriados e dias úteis.
// Feriados nacionais + regra de dias úteis vêm da mesma fonte compartilhada do Vale Transporte
// (@/modules/shared); feriados manuais são próprios do Café da Manhã (BreakfastHoliday).
export async function getBreakfastContext(year: number, month: number) {
  validateCompetence(year, month);
  const competence = await prisma.breakfastCompetence.findUnique({ where: { year_month: { year, month } }, include: { holidays: { orderBy: { date: "asc" } } } });
  const effective = getEffectiveHolidays(year, month, (competence?.holidays ?? []).map((holiday) => ({ id: holiday.id, date: isoDay(holiday.date), name: holiday.name })));
  const holidays = effective.map((holiday) => ({ date: holiday.date, name: holiday.name, source: holiday.source, editable: holiday.source === "MANUAL", manualName: holiday.manualName ?? null }));
  return { year, month, unitPrice: unitPriceOf(competence), unitPriceDefined: Boolean(competence?.unitPrice), holidays, ...summarizeCompetenceDays(year, month, holidays.map((holiday) => holiday.date)) };
}

export async function setBreakfastUnitPrice(year: number, month: number, price: string | number) {
  validateCompetence(year, month);
  let cents: number;
  try { cents = parseUnitPriceToCents(price); } catch (error) { throw new BreakfastValidationError(error instanceof Error ? error.message : "Valor do café da manhã inválido."); }
  await prisma.$transaction((tx) => tx.breakfastCompetence.upsert({ where: { year_month: { year, month } }, create: { year, month, unitPrice: centsToDecimalString(cents) }, update: { unitPrice: centsToDecimalString(cents) } }));
  return getBreakfastContext(year, month);
}

export async function saveBreakfastHoliday(input: { year: number; month: number; date: unknown; name: unknown; userId: string }) {
  validateCompetence(input.year, input.month);
  const date = parseHolidayDate(input.date, input.year, input.month);
  const name = holidayName(input.name);
  if (getBrazilianNationalHolidays(input.year).some((holiday) => holiday.date === isoDay(date))) throw new BreakfastValidationError("Esta data já é um feriado nacional automático e não precisa ser cadastrada.");
  await prisma.$transaction(async (tx) => {
    const competence = await ensureCompetence(tx, input.year, input.month);
    await tx.breakfastHoliday.upsert({ where: { competenceId_date: { competenceId: competence.id, date } }, create: { competenceId: competence.id, date, name, createdByUserId: input.userId }, update: { name } });
  });
  return getBreakfastContext(input.year, input.month);
}

export async function removeBreakfastHoliday(year: number, month: number, date: unknown) {
  validateCompetence(year, month);
  const parsed = parseHolidayDate(date, year, month);
  const competence = await prisma.breakfastCompetence.findUnique({ where: { year_month: { year, month } } });
  const manualExists = competence ? Boolean(await prisma.breakfastHoliday.findFirst({ where: { competenceId: competence.id, date: parsed } })) : false;
  if (!manualExists && getBrazilianNationalHolidays(year).some((holiday) => holiday.date === isoDay(parsed))) throw new BreakfastValidationError("Feriado nacional automático não pode ser removido.");
  if (competence) await prisma.breakfastHoliday.deleteMany({ where: { competenceId: competence.id, date: parsed } });
  return getBreakfastContext(year, month);
}

export async function getBreakfastEmployeeConfigs() {
  // Padrão ATUAL do colaborador (preferência de empresa). Empresa padrão inativa nunca é sugerida (vem como null + flag).
  const rows = await prisma.breakfastEmployeeConfig.findMany({ select: { employeeId: true, defaultCompanyId: true, defaultCompany: { select: { active: true } } } });
  return rows.map((row) => ({ employeeId: row.employeeId, defaultCompanyId: row.defaultCompany?.active ? row.defaultCompanyId : null, defaultCompanyUnavailable: Boolean(row.defaultCompanyId && !row.defaultCompany?.active) }));
}

export type BreakfastEntryInput = {
  employeeId: string;
  companyId: string;
  extraQuantity: number;
  discountQuantity: number;
  observationType?: BreakfastObservationKind | null;
  observationDetails?: string | null;
};

const normalizedKey = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

function validateEntryShape(entry: BreakfastEntryInput) {
  if (typeof entry.employeeId !== "string" || !entry.employeeId) throw new BreakfastValidationError("Colaborador inválido.");
  // A empresa vem SEMPRE do cadastro mestre (Company): id obrigatório; texto livre nunca é aceito.
  if (typeof entry.companyId !== "string" || !entry.companyId) throw new BreakfastValidationError("Selecione uma empresa cadastrada para cada colaborador.");
  if (!Number.isInteger(entry.extraQuantity)) throw new BreakfastValidationError("Quantidade extras deve ser um número inteiro.");
  if (entry.extraQuantity < 0) throw new BreakfastValidationError("Quantidade extras não pode ser negativa.");
  if (!Number.isInteger(entry.discountQuantity)) throw new BreakfastValidationError("Desconto deve ser um número inteiro.");
  if (entry.discountQuantity < 0) throw new BreakfastValidationError("Desconto não pode ser negativo.");
  if (entry.observationType && entry.observationType !== "RETROACTIVE" && entry.observationType !== "OTHER") throw new BreakfastValidationError("Tipo de observação inválido.");
  if (entry.observationType === "OTHER" && !entry.observationDetails?.trim()) throw new BreakfastValidationError("Informe o detalhe da observação.");
}

type EmployeeRef = { id: string; officialName: string; department: string; costCenter: string };
type CompanyRef = { id: string; legalName: string; tradeName: string | null };
// Linha do lançamento: tudo derivado no backend; o nome da empresa é o snapshot do cadastro mestre NO MOMENTO.
function computeEntryRow(entry: BreakfastEntryInput, employee: EmployeeRef, company: CompanyRef, workingDays: number, unitPriceCents: number) {
  let finalQuantity: number, totalCents: number;
  try {
    finalQuantity = calculateFinalQuantity(workingDays, entry.extraQuantity, entry.discountQuantity);
    totalCents = calculateBreakfastEmployeeTotal(unitPriceCents, finalQuantity);
  } catch (error) { throw new BreakfastValidationError((error as BreakfastCalculationError).message); }
  return {
    employeeId: employee.id,
    company: company.tradeName?.trim() || company.legalName, companyId: company.id,
    employeeName: employee.officialName,
    department: employee.department, costCenter: employee.costCenter,
    workingDays, baseQuantity: workingDays, extraQuantity: entry.extraQuantity, discountQuantity: entry.discountQuantity, finalQuantity,
    unitPrice: centsToDecimalString(unitPriceCents),
    observationType: entry.observationType ?? null, observationDetails: entry.observationDetails?.trim() || null,
    amount: new Prisma.Decimal(centsToDecimalString(totalCents)),
  };
}

// O backend RECALCULA tudo (dias úteis, quantidade final, total, totais por empresa/departamento) — o
// frontend só envia insumos; nenhum valor monetário do cliente é aceito.
export async function addBreakfastEntries(input: { year: number; month: number; administrativeEntityId: string; entries: BreakfastEntryInput[]; userId: string }) {
  validateCompetence(input.year, input.month);
  if (!Array.isArray(input.entries) || !input.entries.length) throw new BreakfastValidationError("Selecione ao menos um colaborador.");
  const ids = input.entries.map((entry) => entry.employeeId);
  if (new Set(ids).size !== ids.length) throw new BreakfastValidationError("Há colaboradores duplicados no lançamento.");
  for (const entry of input.entries) validateEntryShape(entry);

  return prisma.$transaction(async (tx) => {
    const [entity, employees, companies] = await Promise.all([
      tx.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId } }),
      tx.foodEmployee.findMany({ where: { id: { in: ids }, active: true } }),
      tx.company.findMany({ where: { id: { in: [...new Set(input.entries.map((entry) => entry.companyId))] }, active: true } }),
    ]);
    if (!entity) throw new BreakfastValidationError("Cadastro da obrigação não encontrado.");
    if (employees.length !== ids.length) throw new BreakfastValidationError("Um ou mais colaboradores não estão ativos ou não foram encontrados.");
    // Regra operacional: só o departamento TOPOGEO recebe Café da Manhã — validado no servidor,
    // independente do que o frontend enviar (proteção contra payload manipulado).
    const outsideDepartment = employees.find((employee) => organizationalComparisonKey(employee.department) !== organizationalComparisonKey(BREAKFAST_ALLOWED_DEPARTMENT));
    if (outsideDepartment) throw new BreakfastValidationError(`Apenas colaboradores do departamento ${BREAKFAST_ALLOWED_DEPARTMENT} podem ser incluídos no Café da Manhã.`);
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const companyById = new Map(companies.map((company) => [company.id, company]));
    if (input.entries.some((entry) => !companyById.has(entry.companyId))) throw new BreakfastValidationError("Selecione uma empresa cadastrada para cada colaborador.");

    await ensureCompetence(tx, input.year, input.month);
    const competence = await tx.breakfastCompetence.findUniqueOrThrow({ where: { year_month: { year: input.year, month: input.month } }, include: { holidays: true } });
    const currentUnitPriceCents = parseUnitPriceToCents(unitPriceOf(competence));
    // Feriados efetivos = nacionais (código) + manuais próprios do Café da Manhã; só um NOVO mapa (ou mapa sem registros) usa isto.
    const currentHolidays = toHolidaySnapshot(getEffectiveHolidays(input.year, input.month, competence.holidays.map((holiday) => ({ id: holiday.id, date: isoDay(holiday.date), name: holiday.name }))));
    const currentWorkingDays = summarizeCompetenceDays(input.year, input.month, currentHolidays.map((holiday) => holiday.date)).workingDays;

    let map = await tx.breakfastMap.findFirst({ where: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, current: true } });
    // O MAPA é a fonte histórica: valor unitário e dias úteis vêm dos registros ativos dele e os feriados do holidaysSnapshot.
    // A configuração atual da competência só vale para um mapa novo (ou sem registros ativos).
    const baseRow = map ? await tx.breakfastAllocation.findFirst({ where: { mapId: map.id, deletedAt: null, workingDays: { not: null }, unitPrice: { not: null } }, orderBy: { sourceRow: "asc" } }) : null;
    const unitPriceCents = baseRow ? parseUnitPriceToCents(baseRow.unitPrice!.toFixed(2)) : currentUnitPriceCents;
    const workingDays = baseRow ? baseRow.workingDays! : currentWorkingDays;
    const holidaysSnapshot = baseRow ? (map!.holidaysSnapshot ?? undefined) : currentHolidays;
    // Persiste o valor efetivo unitário na competência (snapshot para novos mapas).
    if (!competence.unitPrice) await tx.breakfastCompetence.update({ where: { id: competence.id }, data: { unitPrice: centsToDecimalString(currentUnitPriceCents) } });
    if (map && !baseRow) map = await tx.breakfastMap.update({ where: { id: map.id }, data: { holidaysSnapshot: currentHolidays } });
    if (!map) {
      const last = await tx.breakfastMap.findFirst({ where: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId }, orderBy: { version: "desc" } });
      map = await tx.breakfastMap.create({ data: { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, createdByUserId: input.userId, version: (last?.version ?? 0) + 1, status: "READY", holidaysSnapshot, totalRows: 0, validRows: 0, invalidRows: 0, totalAmount: 0 } });
    }

    const existing = await tx.breakfastAllocation.findMany({ where: { mapId: map.id, deletedAt: null, employeeId: { in: ids } }, select: { employeeId: true } });
    const duplicateIds = new Set(existing.map((row) => row.employeeId));
    const accepted = input.entries.filter((entry) => !duplicateIds.has(entry.employeeId));
    if (!accepted.length) return { map: null, createdCount: 0, duplicateCount: duplicateIds.size, duplicateNames: [...duplicateIds].map((id) => employeeById.get(id!)?.officialName ?? id) };

    const source = (await tx.breakfastAllocation.aggregate({ where: { mapId: map.id }, _max: { sourceRow: true } }))._max.sourceRow ?? 0;
    const rows = accepted.map((entry, index) => ({
      ...computeEntryRow(entry, employeeById.get(entry.employeeId)!, companyById.get(entry.companyId)!, workingDays, unitPriceCents),
      mapId: map!.id, competenceId: competence.id, administrativeEntityId: input.administrativeEntityId,
      sourceRow: source + index + 1, createdByUserId: input.userId,
    }));
    await tx.breakfastAllocation.createMany({ data: rows });

    // Empresa padrão do colaborador (só para PRÓXIMOS lançamentos; nunca relida para recalcular histórico).
    // Empresa já validada (ativa, cadastro mestre) acima; o padrão é atualizado na MESMA transação do lançamento.
    for (const entry of accepted) await tx.breakfastEmployeeConfig.upsert({ where: { employeeId: entry.employeeId }, create: { employeeId: entry.employeeId, defaultCompanyId: entry.companyId }, update: { defaultCompanyId: entry.companyId } });

    const all = await tx.breakfastAllocation.findMany({ where: { mapId: map.id, deletedAt: null }, select: { amount: true, company: true, department: true } });
    const total = all.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
    const group = (key: (row: (typeof all)[number]) => string) => [...all.reduce((groups, row) => groups.set(key(row), (groups.get(key(row)) ?? new Prisma.Decimal(0)).add(row.amount)), new Map<string, Prisma.Decimal>()).values()].reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
    if (!group((row) => normalizedKey(row.company)).equals(total) || !group((row) => `${normalizedKey(row.company)}|${normalizedKey(row.department ?? "")}`).equals(total)) {
      throw new BreakfastValidationError("Erro de integridade no rateio: colaborador, departamento, empresa e total geral divergem.");
    }

    let financialRecordId = map.financialRecordId;
    if (financialRecordId) await tx.financialRecord.update({ where: { id: financialRecordId }, data: { grossAmount: total } });
    else financialRecordId = (await createFinancialRecordInTransaction(tx, { administrativeEntityId: input.administrativeEntityId, grossAmount: total, createdByUserId: input.userId })).id;
    await tx.breakfastMap.update({ where: { id: map.id }, data: { totalRows: all.length, validRows: all.length, totalAmount: total, financialRecordId } });
    const saved = await tx.breakfastMap.findUniqueOrThrow({ where: { id: map.id }, include: { administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } });
    return { map: saved, createdCount: accepted.length, duplicateCount: duplicateIds.size, duplicateNames: [...duplicateIds].map((id) => employeeById.get(id!)?.officialName ?? id) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function assertFinancialPristine(record: { lifecycleState: string; paymentState: string; reconciliationState: string; accountingState: string } | null) {
  if (record && (record.lifecycleState !== "ACTIVE" || record.paymentState !== "PENDING" || record.reconciliationState !== "PENDING" || record.accountingState !== "PENDING")) {
    throw new BreakfastValidationError("Este lançamento já avançou no fluxo financeiro e não pode ser corrigido diretamente.");
  }
}

// Correção de lançamento concluído: cancelamento LÓGICO do registro original + novo registro, na mesma transação
// (nunca DELETE físico). Por padrão PRESERVA os snapshots do registro original (valor unitário, dias úteis,
// empresa, departamento, centro de custo e feriados do mapa); só campos alterados explicitamente
// (quantidade extras, empresa, observação) mudam — mesmo princípio do Vale Transporte.
export async function correctBreakfastEntry(input: { mapId: string; allocationId: string; entry: BreakfastEntryInput; reason: string; userId: string }) {
  if (!input.reason?.trim()) throw new BreakfastValidationError("Informe o motivo da correção.");
  validateEntryShape(input.entry);
  return prisma.$transaction(async (tx) => {
    const map = await tx.breakfastMap.findUnique({ where: { id: input.mapId }, include: { financialRecord: true } });
    if (!map || !map.current || map.cancelledAt) throw new BreakfastValidationError("Lançamento ativo não encontrado.");
    assertFinancialPristine(map.financialRecord);
    const original = await tx.breakfastAllocation.findFirst({ where: { id: input.allocationId, mapId: map.id, deletedAt: null } });
    if (!original) throw new BreakfastValidationError("Registro não encontrado ou já cancelado.");

    if (input.entry.employeeId !== original.employeeId) throw new BreakfastValidationError("A correção não pode trocar o colaborador do registro.");
    const companyChanged = input.entry.companyId !== original.companyId;
    const [employee, company, clash] = await Promise.all([
      tx.foodEmployee.findFirst({ where: { id: input.entry.employeeId } }),
      companyChanged ? tx.company.findFirst({ where: { id: input.entry.companyId, active: true } }) : Promise.resolve({ id: original.companyId!, legalName: original.company, tradeName: null }),
      tx.breakfastAllocation.findFirst({ where: { mapId: map.id, deletedAt: null, employeeId: input.entry.employeeId, NOT: { id: original.id } } }),
    ]);
    if (!employee) throw new BreakfastValidationError("Colaborador não encontrado.");
    if (!company) throw new BreakfastValidationError("Selecione uma empresa cadastrada e ativa.");
    if (clash) throw new BreakfastValidationError("Este colaborador já possui outro registro ativo nesta competência.");

    if (original.workingDays === null || original.unitPrice === null || original.companyId === null) throw new BreakfastValidationError("Registro sem snapshot completo não é corrigido por este fluxo.");
    const unitPriceCents = parseUnitPriceToCents(original.unitPrice.toFixed(2));
    const snapshotEmployee = { id: employee.id, officialName: original.employeeName, department: original.department ?? employee.department, costCenter: original.costCenter ?? employee.costCenter };
    const row = computeEntryRow(input.entry, snapshotEmployee, company, original.workingDays, unitPriceCents);
    const sourceRow = ((await tx.breakfastAllocation.aggregate({ where: { mapId: map.id }, _max: { sourceRow: true } }))._max.sourceRow ?? 0) + 1;
    const replacement = await tx.breakfastAllocation.create({ data: { ...row, mapId: map.id, competenceId: map.competenceId, administrativeEntityId: map.administrativeEntityId, sourceRow, createdByUserId: input.userId } });
    await tx.breakfastAllocation.update({ where: { id: original.id }, data: { deletedAt: new Date(), deletedByUserId: input.userId, deletionReason: `Correção: ${input.reason.trim()} (substituído por ${replacement.id})` } });
    // Empresa padrão só muda se a empresa foi alterada EXPLICITAMENTE; snapshot histórico nunca reverte o padrão atual.
    if (companyChanged) await tx.breakfastEmployeeConfig.upsert({ where: { employeeId: employee.id }, create: { employeeId: employee.id, defaultCompanyId: input.entry.companyId }, update: { defaultCompanyId: input.entry.companyId } });

    const aggregate = await tx.breakfastAllocation.aggregate({ where: { mapId: map.id, deletedAt: null }, _sum: { amount: true }, _count: true });
    const total = aggregate._sum.amount ?? new Prisma.Decimal(0);
    if (map.financialRecordId) await tx.financialRecord.update({ where: { id: map.financialRecordId }, data: { grossAmount: total } });
    await tx.breakfastMap.update({ where: { id: map.id }, data: { totalRows: aggregate._count, validRows: aggregate._count, totalAmount: total } });
    return { replacementId: replacement.id, originalId: original.id, totalAmount: total.toFixed(2) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
