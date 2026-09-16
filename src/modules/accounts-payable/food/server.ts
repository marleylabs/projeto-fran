import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { removePrivateFile, sanitizeOriginalName, storePrivateFile } from "@/modules/documents/server/privateStorage";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import { localityAllows, parseFoodCsv, parseFoodXlsx } from "./processing";
import { canManageFoodOccurrences } from "./batch-state";

export const MAX_FOOD_FILE_SIZE = 10 * 1024 * 1024;
export const FOOD_LOCALITIES = ["MA", "PA"] as const;
export type FoodLocality = (typeof FOOD_LOCALITIES)[number];

export class FoodBatchValidationError extends Error {}

function validateCompetence(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new FoodBatchValidationError("Competência inválida.");
  }
}

export async function resolveFoodUnitPrice(year: number, month: number, locality: FoodLocality, administrativeEntityId: string) {
  const configs = await prisma.foodUnitPriceConfig.findMany({ where: { active: true } });
  const applicable = configs.filter((config) =>
    config.administrativeEntityId === administrativeEntityId &&
    (!config.locality || config.locality === locality) &&
    (!config.effectiveYear || config.effectiveYear < year || (config.effectiveYear === year && (!config.effectiveMonth || config.effectiveMonth <= month)))
  );
  applicable.sort((a, b) => {
    const specificityA = Number(Boolean(a.administrativeEntityId)) * 2 + Number(Boolean(a.locality));
    const specificityB = Number(Boolean(b.administrativeEntityId)) * 2 + Number(Boolean(b.locality));
    if (specificityA !== specificityB) return specificityB - specificityA;
    return (b.effectiveYear ?? 0) - (a.effectiveYear ?? 0) || (b.effectiveMonth ?? 0) - (a.effectiveMonth ?? 0) || b.createdAt.getTime() - a.createdAt.getTime();
  });
  if (!applicable[0]) throw new FoodBatchValidationError("Configure o valor por colaborador deste fornecedor antes de processar o lote.");
  return applicable[0].unitPrice;
}

export async function getFoodCompetence(year: number, month: number) {
  validateCompetence(year, month);
  const [competence, priceConfigs] = await Promise.all([
    prisma.foodCompetence.findUnique({
      where: { year_month: { year, month } },
      include: { batches: { where: { current: true, cancelledAt: null }, include: { administrativeEntity: true, financialRecord: true, allocations: { orderBy: { sourceRow: "asc" } }, _count: { select: { mealOccurrences: { where: { deletedAt: null } } } }, issues: { orderBy: { sourceRow: "asc" } }, revisions: { orderBy: { revision: "desc" } } } } },
    }),
    prisma.foodUnitPriceConfig.findMany({ where: { active: true }, orderBy: [{ effectiveYear: "desc" }, { effectiveMonth: "desc" }, { createdAt: "desc" }] }),
  ]);
  const editableBatchIds = competence?.batches.filter((batch) => canManageFoodOccurrences(batch.status)).map((batch) => batch.id) ?? [];
  const editableOccurrences = editableBatchIds.length ? await prisma.foodMealOccurrence.findMany({ where: { batchId: { in: editableBatchIds }, deletedAt: null }, orderBy: { sourceRow: "asc" } }) : [];
  const occurrencesByBatch = new Map<string, typeof editableOccurrences>();
  for (const occurrence of editableOccurrences) occurrencesByBatch.set(occurrence.batchId, [...(occurrencesByBatch.get(occurrence.batchId) ?? []), occurrence]);
  const responseCompetence = competence ? { ...competence, batches: competence.batches.map(({ _count, ...batch }) => ({ ...batch, mealOccurrenceCount: _count.mealOccurrences, mealOccurrences: occurrencesByBatch.get(batch.id) ?? [] })) } : null;
  const supplierPrices = new Map<string, Prisma.Decimal>();
  for (const config of priceConfigs) if (!supplierPrices.has(config.administrativeEntityId) &&
    (!config.effectiveYear || config.effectiveYear < year || (config.effectiveYear === year && (!config.effectiveMonth || config.effectiveMonth <= month)))) supplierPrices.set(config.administrativeEntityId, config.unitPrice);
  const employees = await prisma.foodEmployee.findMany({ where: { active: true }, orderBy: { officialName: "asc" } });
  return { competence: responseCompetence, supplierPrices: Object.fromEntries(supplierPrices), employees };
}

export async function getFoodBatchOccurrences(batchId: string) {
  const batch = await prisma.foodBatch.findFirst({ where: { id: batchId, current: true, cancelledAt: null }, select: { id: true } });
  if (!batch) throw new FoodBatchValidationError("Lote não encontrado.");
  return prisma.foodMealOccurrence.findMany({ where: { batchId, deletedAt: null }, orderBy: { sourceRow: "asc" } });
}

export async function updateSupplierFoodPrice(unitPriceInput: string, year: number, month: number, administrativeEntityId: string) {
  validateCompetence(year, month);
  let unitPrice: Prisma.Decimal;
  try { unitPrice = new Prisma.Decimal(unitPriceInput); } catch { throw new FoodBatchValidationError("Valor unitário inválido."); }
  if (!unitPrice.greaterThan(0)) throw new FoodBatchValidationError("O valor unitário deve ser maior que zero.");
  const entity = await prisma.administrativeEntity.findUnique({ where: { id: administrativeEntityId } });
  if (!entity) throw new FoodBatchValidationError("Fornecedor não encontrado em Cadastros.");
  return prisma.foodUnitPriceConfig.create({ data: { unitPrice, effectiveYear: year, effectiveMonth: month, administrativeEntityId } });
}

export async function processFoodBatch(input: { year: number; month: number; locality: FoodLocality; administrativeEntityId: string; userId: string; file: File }) {
  validateCompetence(input.year, input.month);
  if (!FOOD_LOCALITIES.includes(input.locality)) throw new FoodBatchValidationError("Localidade inválida.");
  if (input.file.size <= 0 || input.file.size > MAX_FOOD_FILE_SIZE) throw new FoodBatchValidationError("A planilha deve possuir até 10 MB.");
  const extension = input.file.name.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx") throw new FoodBatchValidationError("Envie um arquivo CSV ou XLSX.");
  const entity = await prisma.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId } });
  if (!entity) throw new FoodBatchValidationError("Favorecido não encontrado em Cadastros.");
  if (!localityAllows(entity.locality, input.locality)) throw new FoodBatchValidationError(`O cadastro ${entity.tradeName} não está habilitado para ${input.locality}.`);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (extension === "xlsx" && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new FoodBatchValidationError("O arquivo XLSX possui assinatura inválida.");
  const processing = extension === "xlsx" ? await parseFoodXlsx(buffer) : parseFoodCsv(buffer.toString("utf8"));
  const unitPrice = await resolveFoodUnitPrice(input.year, input.month, input.locality, input.administrativeEntityId);
  const totalAmount = unitPrice.mul(processing.allocations.length);
  const allocationSum = processing.allocations.reduce((sum) => sum.add(unitPrice), new Prisma.Decimal(0));
  const departments = new Map<string, number>();
  for (const row of processing.allocations) departments.set(row.department, (departments.get(row.department) ?? 0) + 1);
  const departmentSum = [...departments.values()].reduce((sum, count) => sum.add(unitPrice.mul(count)), new Prisma.Decimal(0));
  if (!allocationSum.equals(totalAmount) || !departmentSum.equals(totalAmount)) throw new FoodBatchValidationError("Erro de integridade: os rateios não correspondem ao total do lote.");
  if (processing.allocations.length === 0 && processing.issues.length === 0) processing.issues.push({ sourceRow: null, employeeName: null, code: "NO_VALID_ROWS", message: "Nenhum colaborador válido foi encontrado." });

  const stored = await storePrivateFile(buffer);
  try {
    return await prisma.$transaction(async (tx) => {
      const competence = await tx.foodCompetence.upsert({ where: { year_month: { year: input.year, month: input.month } }, create: { year: input.year, month: input.month }, update: {} });
      const supplierScope = { competenceId: competence.id, locality: input.locality, administrativeEntityId: input.administrativeEntityId };
      const previous = await tx.foodBatch.findFirst({ where: { ...supplierScope, current: true }, orderBy: { version: "desc" } });
      if (previous) {
        await tx.foodBatch.update({ where: { id: previous.id }, data: { current: false } });
        if (previous.financialRecordId) await tx.financialRecord.update({ where: { id: previous.financialRecordId }, data: { lifecycleState: "CANCELLED", paymentState: "CANCELLED" } });
      }
      const last = await tx.foodBatch.findFirst({ where: supplierScope, select: { version: true }, orderBy: { version: "desc" } });
      const status = processing.issues.length ? "WITH_INCONSISTENCIES" as const : "READY" as const;
      const batch = await tx.foodBatch.create({ data: {
        competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, uploadedByUserId: input.userId,
        locality: input.locality, version: (last?.version ?? 0) + 1, status, originalName: sanitizeOriginalName(input.file.name), storageKey: stored.storageKey,
        mimeType: extension === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: input.file.size, sha256: stored.sha256,
        unitPrice, totalRows: processing.totalRows, validRows: processing.allocations.length, invalidRows: processing.issues.length, totalAmount,
        allocations: { create: processing.allocations.map((row) => ({ competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, sourceRow: row.sourceRow, sourceIdentifier: row.identifier, employeeName: row.employeeName, department: row.department, locality: input.locality, unitPrice, amount: unitPrice })) },
        issues: { create: processing.issues.map((issue) => ({ sourceRow: issue.sourceRow, employeeName: issue.employeeName, code: issue.code, message: issue.message })) },
      } });
      if (status === "READY") {
        const financialRecord = await createFinancialRecordInTransaction(tx, { administrativeEntityId: input.administrativeEntityId, grossAmount: totalAmount, createdByUserId: input.userId });
        await tx.foodBatch.update({ where: { id: batch.id }, data: { financialRecordId: financialRecord.id } });
      }
      return tx.foodBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { administrativeEntity: true, financialRecord: true, allocations: { orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) { await removePrivateFile(stored.storageKey); throw error; }
}
