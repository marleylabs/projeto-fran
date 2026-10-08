import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import { FoodBatchValidationError, resolveFoodUnitPrice } from "./server";
import { isFoodMaCycle, occurrenceBelongsToMaCycle } from "./cycles";
import { normalizeFoodName } from "./ma-processing";
import { buildManualFoodCombinations, manualFoodUsesSupplierPrice } from "./manual-contract";
import { FOOD_PA_INVOICE_REQUIRED_MESSAGE, foodPaInvoiceLabel, isFoodPaInvoiceCode } from "./invoice-company";
import { loadFoodRateioSnapshots } from "./rateio-snapshot";

type ManualFoodInput = {
  year: number;
  month: number;
  locality: "MA" | "PA";
  cycle?: number;
  administrativeEntityId: string;
  employeeIds?: string[];
  dates?: string[];
  occurredOn?: string;
  collaborators?: Array<{ collaboratorId: string; quantity: number; invoiceEmission?: string }>;
  invoiceEmission?: string;
  amount?: string;
  userId: string;
};

export async function addManualFoodOccurrences(input: ManualFoodInput) {
  const paItems = input.locality === "PA" ? (input.collaborators ?? []) : [];
  const ids = [
    ...new Set(
      input.locality === "PA"
        ? paItems.map((item) => item.collaboratorId).filter(Boolean)
        : (input.employeeIds ?? []).filter(Boolean),
    ),
  ];
  if (!ids.length)
    throw new FoodBatchValidationError("Selecione ao menos um colaborador.");
  if (
    input.locality === "PA" &&
    (paItems.length !== ids.length ||
      paItems.some(
        (item) => !Number.isInteger(item.quantity) || item.quantity < 1,
      ))
  )
    throw new FoodBatchValidationError(
      "Informe uma quantidade inteira de refeições para cada colaborador.",
    );
  // PA: Emissão NF individual (define a empresa do rateio). Validada aqui — antes de qualquer escrita —
  // independentemente do select do frontend: somente NF_01/NF_02; a empresa é derivada, nunca recebida.
  if (input.locality === "PA" && paItems.some((item) => !isFoodPaInvoiceCode(item.invoiceEmission)))
    throw new FoodBatchValidationError(FOOD_PA_INVOICE_REQUIRED_MESSAGE);
  const paInvoiceById = new Map(
    paItems.map((item) => [item.collaboratorId, isFoodPaInvoiceCode(item.invoiceEmission) ? foodPaInvoiceLabel(item.invoiceEmission) : null]),
  );

  const dateValues =
    input.locality === "MA"
      ? [
          ...new Set(
            (input.dates?.length ? input.dates : [input.occurredOn]).filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ]
      : [];
  if (input.locality === "MA" && !dateValues.length)
    throw new FoodBatchValidationError("Selecione ao menos uma data.");
  const dates = dateValues.map((value) => new Date(`${value}T00:00:00.000Z`));
  if (
    dates.some(
      (date) =>
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== input.year ||
        date.getUTCMonth() + 1 !== input.month,
    )
  )
    throw new FoodBatchValidationError(
      "Uma ou mais datas não pertencem à competência selecionada.",
    );
  const cycle = input.locality === "MA" ? Number(input.cycle) : 0;
  if (
    input.locality === "MA" &&
    (!isFoodMaCycle(cycle) ||
      dates.some(
        (date) =>
          !occurrenceBelongsToMaCycle(date, input.year, input.month, cycle),
      ))
  )
    throw new FoodBatchValidationError(
      "Uma ou mais datas pertencem a outro ciclo.",
    );

  const [employees, entity, configuredPrice] = await Promise.all([
    prisma.foodEmployee.findMany({ where: { id: { in: ids }, active: true } }),
    prisma.administrativeEntity.findUnique({
      where: { id: input.administrativeEntityId },
    }),
    manualFoodUsesSupplierPrice(input.amount)
      ? resolveFoodUnitPrice(
          input.year,
          input.month,
          input.locality,
          input.administrativeEntityId,
        )
      : Promise.resolve(null),
  ]);
  if (employees.length !== ids.length)
    throw new FoodBatchValidationError(
      "Um ou mais colaboradores não estão ativos ou não foram encontrados.",
    );
  if (!entity) throw new FoodBatchValidationError("Fornecedor não encontrado.");
  let unitPrice: Prisma.Decimal;
  try {
    unitPrice =
      configuredPrice ?? new Prisma.Decimal(input.amount!.replace(",", "."));
  } catch {
    throw new FoodBatchValidationError(
      "Informe um valor válido para a ocorrência.",
    );
  }
  if (!unitPrice.isFinite() || unitPrice.lte(0))
    throw new FoodBatchValidationError(
      "Informe um valor válido para a ocorrência.",
    );

  return prisma.$transaction(
    async (tx) => {
      const competence = await tx.foodCompetence.upsert({
        where: { year_month: { year: input.year, month: input.month } },
        create: { year: input.year, month: input.month },
        update: {},
      });
      // MA não usa Emissão NF por colaborador; no PA ela é individual (paInvoiceById).
      const maInvoice = input.locality === "MA" ? input.invoiceEmission?.trim() || null : null;
      const duplicateRows =
        input.locality === "PA"
          ? await tx.foodMealOccurrence.findMany({
              where: {
                employeeId: { in: ids },
                origin: "MANUAL",
                included: true,
                deletedAt: null,
                batch: {
                  competenceId: competence.id,
                  locality: "PA",
                  administrativeEntityId: input.administrativeEntityId,
                  current: true,
                },
              },
              select: {
                batchId: true,
                employeeId: true,
                officialName: true,
                occurredOn: true,
                invoiceEmission: true,
              },
            })
          : await tx.foodMealOccurrence.findMany({
              where: {
                occurredOn: { in: dates },
                employeeId: { in: ids },
                included: true,
                deletedAt: null,
                batch: {
                  competenceId: competence.id,
                  locality: "MA",
                  administrativeEntityId: input.administrativeEntityId,
                  cycle,
                  current: true,
                },
              },
              select: {
                batchId: true,
                employeeId: true,
                officialName: true,
                occurredOn: true,
              },
            });
      // PA: duplicidade = mesmo colaborador com a MESMA Emissão NF já lançada (regra de antes, agora por linha).
      const paDuplicateRows =
        input.locality === "PA"
          ? duplicateRows.filter((row) => row.employeeId && "invoiceEmission" in row && row.invoiceEmission === paInvoiceById.get(row.employeeId))
          : duplicateRows;
      const duplicateIds = new Set(
        paDuplicateRows
          .map((row) => row.employeeId)
          .filter((id): id is string => Boolean(id)),
      );
      const employeeById = new Map(
        employees.map((employee) => [employee.id, employee]),
      );
      const accepted =
        input.locality === "PA"
          ? paItems
              .filter((item) => !duplicateIds.has(item.collaboratorId))
              .map((item) => ({
                employee: employeeById.get(item.collaboratorId)!,
                date: null,
                quantity: item.quantity,
                invoice: paInvoiceById.get(item.collaboratorId) ?? null,
              }))
          : buildManualFoodCombinations(
              ids,
              dateValues,
              new Set(
                duplicateRows.map(
                  (row) =>
                    `${row.employeeId}:${row.occurredOn!.toISOString().slice(0, 10)}`,
                ),
              ),
            ).accepted.map((item) => ({
              employee: employeeById.get(item.employeeId)!,
              date: new Date(`${item.date}T00:00:00.000Z`),
              quantity: 1,
              invoice: maInvoice,
            }));
      const duplicateDetails = paDuplicateRows.map((row) => ({
        employeeId: row.employeeId,
        name: row.officialName,
        date: row.occurredOn?.toISOString().slice(0, 10) ?? null,
      }));
      if (!accepted.length)
        return {
          batchId: duplicateRows[0]?.batchId ?? null,
          createdCount: 0,
          createdMeals: 0,
          duplicateCount:
            input.locality === "PA" ? duplicateIds.size : duplicateRows.length,
          createdTotal: new Prisma.Decimal(0),
          duplicateDetails,
        };

      let batch = await tx.foodBatch.findFirst({
        where: {
          competenceId: competence.id,
          locality: input.locality,
          administrativeEntityId: input.administrativeEntityId,
          cycle,
          current: true,
          originalName: "Lançamentos manuais",
        },
      });
      if (!batch) {
        const last = await tx.foodBatch.findFirst({
          where: {
            competenceId: competence.id,
            locality: input.locality,
            administrativeEntityId: input.administrativeEntityId,
            cycle,
          },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        batch = await tx.foodBatch.create({
          data: {
            competenceId: competence.id,
            administrativeEntityId: input.administrativeEntityId,
            uploadedByUserId: input.userId,
            locality: input.locality,
            cycle,
            version,
            current: true,
            status: "READY",
            originalName: "Lançamentos manuais",
            storageKey: `manual/food/${competence.id}/${input.locality}/${cycle}/${input.administrativeEntityId}/v${version}`,
            mimeType: "application/x-manual-entry",
            sizeBytes: 0,
            sha256: `manual-${competence.id}-${input.locality}-${cycle}-${input.administrativeEntityId}-v${version}`,
            unitPrice,
            totalRows: 0,
            validRows: 0,
            invalidRows: 0,
            totalAmount: 0,
          },
        });
      }
      const source =
        (
          await tx.foodMealOccurrence.aggregate({
            where: { batchId: batch.id },
            _max: { sourceRow: true },
          })
        )._max.sourceRow ?? 0;
      const restaurantName = entity.tradeName?.trim() || entity.legalName;
      // Snapshot do rateio (Centro de Custo; Empresa no MA) lido do cadastro/configuração NO SERVIDOR, neste lançamento.
      const snapshots = await loadFoodRateioSnapshots(tx, input.locality, accepted.map(({ employee }) => employee));
      await tx.foodMealOccurrence.createMany({
        data: accepted.map(({ employee, date, quantity, invoice }, index) => ({
          batchId: batch!.id,
          employeeId: employee.id,
          sourceRow: source + index + 1,
          occurredOn: date,
          mealQuantity: quantity,
          receivedName: employee.officialName,
          normalizedReceivedName: normalizeFoodName(employee.officialName),
          officialName: employee.officialName,
          receivedDepartment: employee.department,
          confirmedDepartment: employee.department,
          ...snapshots.get(employee.id),
          invoiceEmission: invoice,
          restaurantName: input.locality === "PA" ? restaurantName : null,
          validationStatus: "CONFIRMED",
          matchMethod: "MANUAL",
          unitPrice,
          amount: unitPrice.mul(quantity),
          origin: "MANUAL",
          createdByUserId: input.userId,
        })),
      });

      const occurrences = await tx.foodMealOccurrence.findMany({
        where: { batchId: batch.id, included: true, deletedAt: null },
      });
      const groups = new Map<
        string,
        {
          name: string;
          department: string;
          first: number;
          count: number;
          amount: Prisma.Decimal;
        }
      >();
      for (const row of occurrences) {
        if (!row.employeeId || !row.officialName || !row.confirmedDepartment)
          continue;
        const current = groups.get(row.employeeId) ?? {
          name: row.officialName,
          department: row.confirmedDepartment,
          first: row.sourceRow,
          count: 0,
          amount: new Prisma.Decimal(0),
        };
        current.count += row.mealQuantity;
        current.amount = current.amount.add(row.amount);
        groups.set(row.employeeId, current);
      }
      await tx.foodAllocation.deleteMany({ where: { batchId: batch.id } });
      await tx.foodAllocation.createMany({
        data: [...groups].map(([employeeId, group]) => ({
          batchId: batch!.id,
          competenceId: competence.id,
          administrativeEntityId: input.administrativeEntityId,
          sourceRow: group.first,
          sourceIdentifier: employeeId,
          employeeName: group.name,
          department: group.department,
          locality: input.locality,
          unitPrice: group.amount.div(group.count),
          amount: group.amount,
        })),
      });
      const total = occurrences.reduce(
        (sum, row) => sum.add(row.amount),
        new Prisma.Decimal(0),
      );
      const totalMeals = occurrences.reduce(
        (sum, row) => sum + row.mealQuantity,
        0,
      );
      let financialRecordId = batch.financialRecordId;
      if (financialRecordId)
        await tx.financialRecord.update({
          where: { id: financialRecordId },
          data: { grossAmount: total },
        });
      else
        financialRecordId = (
          await createFinancialRecordInTransaction(tx, {
            administrativeEntityId: input.administrativeEntityId,
            grossAmount: total,
            createdByUserId: input.userId,
          })
        ).id;
      await tx.foodBatch.update({
        where: { id: batch.id },
        data: {
          unitPrice,
          totalRows: totalMeals,
          validRows: totalMeals,
          totalAmount: total,
          financialRecordId,
        },
      });
      const createdMeals = accepted.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      return {
        batchId: batch.id,
        createdCount: accepted.length,
        createdMeals,
        duplicateCount:
          input.locality === "PA" ? duplicateIds.size : duplicateRows.length,
        createdTotal: unitPrice.mul(createdMeals),
        duplicateDetails,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
