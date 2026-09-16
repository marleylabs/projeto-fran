import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import {
  removePrivateFile,
  sanitizeOriginalName,
  storePrivateFile,
} from "@/modules/documents/server/privateStorage";
import { localityAllows } from "./processing";
import {
  FoodBatchValidationError,
  MAX_FOOD_FILE_SIZE,
  resolveFoodUnitPrice,
} from "./server";
import {
  normalizeFoodDepartment,
  parseFoodMealCsv,
  parseFoodMealXlsx,
} from "./ma-processing";
import { matchFoodEmployee } from "./matching";
import { isFoodMaCycle, occurrenceBelongsToMaCycle, type FoodMaCycle } from "./cycles";

function validateCompetence(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new FoodBatchValidationError("Competência inválida.");
}
export async function processFoodMaDraft(input: {
  year: number;
  month: number;
  administrativeEntityId: string;
  userId: string;
  file: File;
  cycle: FoodMaCycle;
}) {
  validateCompetence(input.year, input.month);
  if (!isFoodMaCycle(input.cycle))
    throw new FoodBatchValidationError("Selecione o 1º ou o 2º ciclo de MA.");
  if (input.file.size <= 0 || input.file.size > MAX_FOOD_FILE_SIZE)
    throw new FoodBatchValidationError("A planilha deve possuir até 10 MB.");
  const extension = input.file.name.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx")
    throw new FoodBatchValidationError("Envie um arquivo CSV ou XLSX.");
  const entity = await prisma.administrativeEntity.findUnique({
    where: { id: input.administrativeEntityId },
  });
  if (!entity || !localityAllows(entity.locality, "MA"))
    throw new FoodBatchValidationError(
      "Fornecedor não encontrado ou não habilitado para MA.",
    );
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (extension === "xlsx" && !(buffer[0] === 0x50 && buffer[1] === 0x4b))
    throw new FoodBatchValidationError(
      "O arquivo XLSX possui assinatura inválida.",
    );
  const parsed =
    extension === "xlsx"
      ? await parseFoodMealXlsx(buffer)
      : parseFoodMealCsv(buffer.toString("utf8"));
  const outsideCycle = parsed.occurrences.filter(
    (row) => !occurrenceBelongsToMaCycle(row.occurredOn, input.year, input.month, input.cycle),
  );
  const occurrences = parsed.occurrences.filter((row) =>
    occurrenceBelongsToMaCycle(row.occurredOn, input.year, input.month, input.cycle),
  );
  const periodIssues = outsideCycle.map((row) => ({
    sourceRow: row.sourceRow,
    employeeName: row.receivedName,
    code: "OUTSIDE_MA_CYCLE",
    message: `A data deve pertencer à competência selecionada e ao ${input.cycle}º ciclo de MA.`,
  }));
  const issues = [...parsed.issues, ...periodIssues];
  if (!occurrences.length)
    throw new FoodBatchValidationError(
      issues[0]?.message ?? "Nenhuma ocorrência válida encontrada para o ciclo.",
    );
  const unitPrice = await resolveFoodUnitPrice(
    input.year,
    input.month,
    "MA",
    input.administrativeEntityId,
  );
  const [employees, aliases] = await Promise.all([
    prisma.foodEmployee.findMany({ where: { active: true } }),
    prisma.foodEmployeeAlias.findMany({ include: { employee: true } }),
  ]);
  const matches = occurrences.map((occurrence) => ({
    occurrence,
    ...matchFoodEmployee(
      occurrence.receivedName,
      occurrence.receivedDepartment,
      employees,
      aliases,
    ),
  }));
  const counts = new Map<string, number>();
  for (const item of matches) {
    const key = `${item.occurrence.occurredOn.toISOString().slice(0, 10)}|${item.employee?.id ?? item.occurrence.normalizedReceivedName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const stored = await storePrivateFile(buffer);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const competence = await tx.foodCompetence.upsert({
          where: { year_month: { year: input.year, month: input.month } },
          create: { year: input.year, month: input.month },
          update: {},
        });
        const scope = {
          competenceId: competence.id,
          locality: "MA",
          administrativeEntityId: input.administrativeEntityId,
          cycle: input.cycle,
        };
        const previous = await tx.foodBatch.findFirst({
          where: { ...scope, current: true },
          orderBy: { version: "desc" },
        });
        if (previous)
          await tx.foodBatch.update({
            where: { id: previous.id },
            data: { current: false },
          });
        const last = await tx.foodBatch.findFirst({
          where: scope,
          select: { version: true },
          orderBy: { version: "desc" },
        });
        const pendingNames = new Set<string>();
        const occurrenceRows = matches.map(
          ({ occurrence, employee, method }) => {
            const duplicateCandidate =
              (counts.get(
                `${occurrence.occurredOn.toISOString().slice(0, 10)}|${employee?.id ?? occurrence.normalizedReceivedName}`,
              ) ?? 0) > 1;
            const departmentMatches =
              employee &&
              normalizeFoodDepartment(employee.department) ===
                normalizeFoodDepartment(occurrence.receivedDepartment);
            const auto = Boolean(
              employee && departmentMatches && !duplicateCandidate,
            );
            if (!auto) pendingNames.add(occurrence.normalizedReceivedName);
            return {
              employeeId: employee?.id,
              sourceRow: occurrence.sourceRow,
              occurredOn: occurrence.occurredOn,
              receivedName: occurrence.receivedName,
              normalizedReceivedName: occurrence.normalizedReceivedName,
              officialName: employee?.officialName,
              receivedDepartment: occurrence.receivedDepartment,
              confirmedDepartment: departmentMatches
                ? employee?.department
                : null,
              duplicateCandidate,
              duplicateConfirmed: false,
              validationStatus: auto
                ? ("AUTO_MATCHED" as const)
                : ("PENDING" as const),
              matchMethod: method,
              unitPrice,
              amount: unitPrice,
            };
          },
        );
        const batch = await tx.foodBatch.create({
          data: {
            ...scope,
            uploadedByUserId: input.userId,
            version: (last?.version ?? 0) + 1,
            status: "UNDER_REVIEW",
            originalName: sanitizeOriginalName(input.file.name),
            storageKey: stored.storageKey,
            mimeType:
              extension === "csv"
                ? "text/csv"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sizeBytes: input.file.size,
            sha256: stored.sha256,
            unitPrice,
            totalRows: parsed.totalRows,
            validRows: occurrences.length,
            invalidRows: pendingNames.size + issues.length,
            totalAmount: new Prisma.Decimal(0),
            mealOccurrences: { create: occurrenceRows },
            issues: { create: issues },
          },
        });
        return tx.foodBatch.findUniqueOrThrow({
          where: { id: batch.id },
          include: {
            administrativeEntity: true,
            financialRecord: true,
            mealOccurrences: { orderBy: { sourceRow: "asc" } },
            issues: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    await removePrivateFile(stored.storageKey);
    throw error;
  }
}

export type FoodMaResolution = {
  normalizedReceivedName: string;
  employeeId?: string;
  officialName?: string;
  department: string;
  saveAlias?: boolean;
  duplicateAction: "KEEP_ALL" | "KEEP_FIRST";
};
export async function finalizeFoodMaBatch(
  batchId: string,
  userId: string,
  resolutions: FoodMaResolution[],
) {
  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.foodBatch.findUnique({
        where: { id: batchId },
        include: { mealOccurrences: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } },
      });
      if (!batch || !["MA", "PA"].includes(batch.locality) || batch.status !== "UNDER_REVIEW")
        throw new FoodBatchValidationError(
          "Lote de alimentação em revisão não encontrado.",
        );
      const sourceIssues = await tx.foodBatchIssue.count({
        where: { batchId },
      });
      if (batch.locality === "MA" && sourceIssues > 0)
        throw new FoodBatchValidationError(
          "Corrija as linhas inválidas no arquivo e envie uma nova versão antes de finalizar.",
        );
      const bySource = new Map(
        resolutions.map((item) => [item.normalizedReceivedName, item]),
      );
      for (const occurrence of batch.mealOccurrences) {
        const resolution = bySource.get(occurrence.normalizedReceivedName);
        let employee = occurrence.employeeId
          ? await tx.foodEmployee.findUnique({
              where: { id: occurrence.employeeId },
            })
          : null;
        const confirmedDepartment = normalizeOrganizationalValue(
          resolution?.department || occurrence.confirmedDepartment || employee?.department,
        );
        if (!employee && resolution?.employeeId)
          employee = await tx.foodEmployee.findUnique({
            where: { id: resolution.employeeId },
          });
        if (!employee || !confirmedDepartment)
          throw new FoodBatchValidationError(
            `Associe "${occurrence.receivedName}" a um colaborador existente do Cadastro Mestre e confirme o setor.`,
          );
        if (
          resolution?.saveAlias &&
          occurrence.normalizedReceivedName !== employee.normalizedName
        )
          await tx.foodEmployeeAlias.upsert({
            where: { normalizedAlias: occurrence.normalizedReceivedName },
            create: {
              employeeId: employee.id,
              sourceName: occurrence.receivedName,
              normalizedAlias: occurrence.normalizedReceivedName,
            },
            update: {
              employeeId: employee.id,
              sourceName: occurrence.receivedName,
            },
          });
        await tx.foodMealOccurrence.update({
          where: { id: occurrence.id },
          data: {
            employeeId: employee.id,
            officialName: employee.officialName,
            confirmedDepartment,
            validationStatus: "CONFIRMED",
            matchMethod:
              occurrence.validationStatus === "AUTO_MATCHED"
                ? occurrence.matchMethod
                : "MANUAL",
          },
        });
      }
      const resolved = await tx.foodMealOccurrence.findMany({
        where: { batchId, deletedAt: null },
        orderBy: { sourceRow: "asc" },
      });
      const duplicateGroups = new Map<string, typeof resolved>();
      for (const row of resolved) {
        const key = `${row.occurredOn?.toISOString().slice(0, 10) ?? `manual-${row.id}`}|${row.employeeId}|${row.restaurantName ?? batch.administrativeEntityId}`;
        duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), row]);
      }
      for (const rows of duplicateGroups.values())
        if (rows.length > 1) {
          const resolution = bySource.get(rows[0].normalizedReceivedName);
          if (!resolution?.duplicateAction)
            throw new FoodBatchValidationError(
              `Confirme a possível duplicidade de ${rows[0].officialName}.`,
            );
          for (let index = 0; index < rows.length; index += 1) {
            const included =
              resolution.duplicateAction === "KEEP_ALL" || index === 0;
            await tx.foodMealOccurrence.update({
              where: { id: rows[index].id },
              data: {
                duplicateCandidate: true,
                duplicateConfirmed: true,
                included,
                disposition: included ? "VALID" : "DUPLICATE",
              },
            });
          }
        }
      const included = await tx.foodMealOccurrence.findMany({
        where: { batchId, included: true, deletedAt: null },
        orderBy: { sourceRow: "asc" },
      });
      const grouped = new Map<
        string,
        {
          employeeId: string;
          name: string;
          department: string;
          count: number;
          amount: Prisma.Decimal;
          firstRow: number;
        }
      >();
      for (const row of included) {
        if (!row.employeeId || !row.officialName || !row.confirmedDepartment)
          throw new FoodBatchValidationError(
            "Existem ocorrências sem confirmação.",
          );
        const value = grouped.get(row.employeeId) ?? {
          employeeId: row.employeeId,
          name: row.officialName,
          department: row.confirmedDepartment,
          count: 0,
          amount: new Prisma.Decimal(0),
          firstRow: row.sourceRow,
        };
        value.count += row.mealQuantity;
        value.amount = value.amount.add(row.amount);
        grouped.set(row.employeeId, value);
      }
      await tx.foodAllocation.deleteMany({ where: { batchId } });
      const allocations = [...grouped.values()];
      await tx.foodAllocation.createMany({
        data: allocations.map((row) => ({
          batchId,
          competenceId: batch.competenceId,
          administrativeEntityId: batch.administrativeEntityId,
          sourceRow: row.firstRow,
          sourceIdentifier: row.employeeId,
          employeeName: row.name,
          department: row.department,
          locality: batch.locality,
          unitPrice: row.amount.div(row.count),
          amount: row.amount,
        })),
      });
      const total = included.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
      const collaboratorSum = allocations.reduce(
        (sum, row) => sum.add(row.amount),
        new Prisma.Decimal(0),
      );
      const sectorTotals = new Map<string, Prisma.Decimal>();
      for (const row of allocations)
        sectorTotals.set(
          row.department,
          (sectorTotals.get(row.department) ?? new Prisma.Decimal(0)).add(
            row.amount,
          ),
        );
      const sectorSum = [...sectorTotals.values()].reduce(
        (sum, value) => sum.add(value),
        new Prisma.Decimal(0),
      );
      if (!total.equals(collaboratorSum) || !total.equals(sectorSum))
        throw new FoodBatchValidationError(
          "Erro de integridade no rateio por ocorrências, colaboradores ou setores.",
        );
      const previous = await tx.foodBatch.findFirst({
        where: {
          competenceId: batch.competenceId,
          locality: batch.locality,
          administrativeEntityId: batch.administrativeEntityId,
          cycle: batch.cycle,
          id: { not: batch.id },
          financialRecordId: { not: null },
        },
        orderBy: { version: "desc" },
      });
      if (previous?.financialRecordId)
        await tx.financialRecord.update({
          where: { id: previous.financialRecordId },
          data: { lifecycleState: "CANCELLED", paymentState: "CANCELLED" },
        });
      const record = await createFinancialRecordInTransaction(tx, {
        administrativeEntityId: batch.administrativeEntityId,
        grossAmount: total,
        createdByUserId: userId,
      });
      await tx.foodBatch.update({
        where: { id: batch.id },
        data: {
          status: "READY",
          validRows: included.reduce((sum, row) => sum + row.mealQuantity, 0),
          invalidRows: 0,
          totalAmount: total,
          financialRecordId: record.id,
        },
      });
      return tx.foodBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: {
          administrativeEntity: true,
          financialRecord: true,
          allocations: true,
          mealOccurrences: true,
          issues: true,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removeFoodReviewGroup(
  batchId: string,
  normalizedReceivedName: string,
  userId: string,
) {
  if (!normalizedReceivedName.trim())
    throw new FoodBatchValidationError("Grupo de revisão inválido.");
  return prisma.$transaction(async (tx) => {
    const batch = await tx.foodBatch.findUnique({ where: { id: batchId } });
    if (!batch || !batch.current || batch.cancelledAt || batch.status !== "UNDER_REVIEW" || !["MA", "PA"].includes(batch.locality))
      throw new FoodBatchValidationError("Lote de alimentação em revisão não encontrado.");
    const removed = await tx.foodMealOccurrence.updateMany({
      where: { batchId, normalizedReceivedName, deletedAt: null },
      data: { included: false, deletedAt: new Date(), deletedByUserId: userId, deletionReason: "Removido da importação durante a revisão" },
    });
    if (!removed.count)
      throw new FoodBatchValidationError("Este grupo não está mais disponível na revisão.");
    const remaining = await tx.foodMealOccurrence.aggregate({
      where: { batchId, deletedAt: null },
      _count: true,
      _sum: { amount: true, mealQuantity: true },
    });
    await tx.foodBatch.update({
      where: { id: batchId },
      data: { totalRows: remaining._sum.mealQuantity ?? 0, validRows: remaining._sum.mealQuantity ?? 0, totalAmount: remaining._sum.amount ?? new Prisma.Decimal(0) },
    });
    return { removedCount: removed.count, remainingCount: remaining._sum.mealQuantity ?? 0, totalAmount: (remaining._sum.amount ?? new Prisma.Decimal(0)).toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function discardFoodImportReview(batchId: string, userId: string) {
  const storageKey = await prisma.$transaction(async (tx) => {
    const batch = await tx.foodBatch.findUnique({ where: { id: batchId } });
    if (!batch || !batch.current || batch.cancelledAt || batch.status !== "UNDER_REVIEW" || !["MA", "PA"].includes(batch.locality))
      throw new FoodBatchValidationError("Importação em revisão não encontrada.");
    const now = new Date();
    await tx.foodMealOccurrence.updateMany({
      where: { batchId, deletedAt: null },
      data: { included: false, deletedAt: now, deletedByUserId: userId, deletionReason: "Importação cancelada durante a revisão" },
    });
    await tx.foodBatch.update({
      where: { id: batchId },
      data: { current: false, cancelledAt: now, cancelledByUserId: userId, cancellationReason: "Importação cancelada durante a revisão", validRows: 0, totalAmount: 0 },
    });
    return batch.storageKey;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await removePrivateFile(storageKey);
  return { cancelled: true };
}

export type FoodMaEdit = {
  occurrenceId: string;
  employeeId?: string;
  officialName?: string;
  department: string;
  disposition: "VALID" | "DUPLICATE" | "IGNORED";
  saveAlias?: boolean;
  mealQuantity?: number;
};

export async function editFoodMaBatch(
  batchId: string,
  userId: string,
  edits: FoodMaEdit[],
) {
  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.foodBatch.findUnique({
        where: { id: batchId },
        include: { mealOccurrences: { orderBy: { sourceRow: "asc" } } },
      });
      if (
        !batch ||
        !["MA", "PA"].includes(batch.locality) ||
        batch.status !== "READY" ||
        !batch.current
      )
        throw new FoodBatchValidationError(
          "Rateio de alimentação concluído não encontrado.",
        );
      const byId = new Map(edits.map((edit) => [edit.occurrenceId, edit]));
      if (byId.size !== batch.mealOccurrences.length)
        throw new FoodBatchValidationError(
          "Envie a situação atual de todas as ocorrências do rateio.",
        );
      const audit: Record<string, unknown>[] = [];
      for (const occurrence of batch.mealOccurrences) {
        const edit = byId.get(occurrence.id);
        if (!edit || !edit.department.trim())
          throw new FoodBatchValidationError(
            `Preencha o setor da linha ${occurrence.sourceRow}.`,
          );
        const mealQuantity = occurrence.occurredOn ? occurrence.mealQuantity : Number(edit.mealQuantity);
        if (!Number.isInteger(mealQuantity) || mealQuantity < 1)
          throw new FoodBatchValidationError(`Informe uma quantidade válida na linha ${occurrence.sourceRow}.`);
        const employee = edit.employeeId
          ? await tx.foodEmployee.findUnique({ where: { id: edit.employeeId } })
          : null;
        if (!employee)
          throw new FoodBatchValidationError(
            `Selecione um colaborador existente do Cadastro Mestre na linha ${occurrence.sourceRow}.`,
          );
        if (
          edit.saveAlias &&
          occurrence.normalizedReceivedName !== employee.normalizedName
        )
          await tx.foodEmployeeAlias.upsert({
            where: { normalizedAlias: occurrence.normalizedReceivedName },
            create: {
              employeeId: employee.id,
              sourceName: occurrence.receivedName,
              normalizedAlias: occurrence.normalizedReceivedName,
            },
            update: {
              employeeId: employee.id,
              sourceName: occurrence.receivedName,
            },
          });
        const included = edit.disposition === "VALID";
        if (
          occurrence.employeeId !== employee.id ||
          occurrence.confirmedDepartment !== normalizeOrganizationalValue(edit.department) ||
          occurrence.disposition !== edit.disposition || occurrence.mealQuantity !== mealQuantity
        )
          audit.push({
            occurrenceId: occurrence.id,
            sourceRow: occurrence.sourceRow,
            receivedName: occurrence.receivedName,
            before: {
              employeeId: occurrence.employeeId,
              officialName: occurrence.officialName,
              department: occurrence.confirmedDepartment,
              disposition: occurrence.disposition,
              mealQuantity: occurrence.mealQuantity,
            },
            after: {
              employeeId: employee.id,
              officialName: employee.officialName,
              department: normalizeOrganizationalValue(edit.department),
              disposition: edit.disposition,
              mealQuantity,
            },
          });
        await tx.foodMealOccurrence.update({
          where: { id: occurrence.id },
          data: {
            employeeId: employee.id,
            officialName: employee.officialName,
            confirmedDepartment: normalizeOrganizationalValue(edit.department),
            included,
            duplicateConfirmed: edit.disposition === "DUPLICATE",
            validationStatus: "CONFIRMED",
            matchMethod: "MANUAL",
            disposition: edit.disposition,
            mealQuantity,
            amount: occurrence.unitPrice.mul(mealQuantity),
          },
        });
      }
      const included = await tx.foodMealOccurrence.findMany({
        where: { batchId, included: true },
        orderBy: { sourceRow: "asc" },
      });
      const grouped = new Map<
        string,
        {
          employeeId: string;
          name: string;
          department: string;
          count: number;
          amount: Prisma.Decimal;
          firstRow: number;
        }
      >();
      for (const row of included) {
        if (!row.employeeId || !row.officialName || !row.confirmedDepartment)
          throw new FoodBatchValidationError(
            "Existem ocorrências válidas sem associação completa.",
          );
        const department = normalizeOrganizationalValue(row.confirmedDepartment);
        const key = `${row.employeeId}|${department}`;
        const value = grouped.get(key) ?? {
          employeeId: row.employeeId,
          name: row.officialName,
          department,
          count: 0,
          amount: new Prisma.Decimal(0),
          firstRow: row.sourceRow,
        };
        value.count += row.mealQuantity;
        value.amount = value.amount.add(row.amount);
        grouped.set(key, value);
      }
      const allocations = [...grouped.values()];
      const total = included.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
      const allocationSum = allocations.reduce(
        (sum, row) => sum.add(row.amount),
        new Prisma.Decimal(0),
      );
      if (!total.equals(allocationSum))
        throw new FoodBatchValidationError(
          "Erro de integridade: ocorrências e rateio não conferem.",
        );
      await tx.foodAllocation.deleteMany({ where: { batchId } });
      if (allocations.length)
        await tx.foodAllocation.createMany({
          data: allocations.map((row) => ({
            batchId,
            competenceId: batch.competenceId,
            administrativeEntityId: batch.administrativeEntityId,
            sourceRow: row.firstRow,
            sourceIdentifier: row.employeeId,
            employeeName: row.name,
            department: row.department,
            locality: batch.locality,
            unitPrice: row.amount.div(row.count),
            amount: row.amount,
          })),
        });
      if (!batch.financialRecordId)
        throw new FoodBatchValidationError(
          "A obrigação vinculada ao rateio não foi encontrada.",
        );
      await tx.financialRecord.update({
        where: { id: batch.financialRecordId },
        data: { grossAmount: total },
      });
      const lastRevision = await tx.foodBatchRevision.aggregate({
        where: { batchId },
        _max: { revision: true },
      });
      await tx.foodBatchRevision.create({
        data: {
          batchId,
          editedByUserId: userId,
          revision: (lastRevision._max.revision ?? 0) + 1,
          previousTotal: batch.totalAmount,
          newTotal: total,
          changes: audit as Prisma.InputJsonValue,
        },
      });
      await tx.foodBatch.update({
        where: { id: batchId },
        data: {
          validRows: included.reduce((sum, row) => sum + row.mealQuantity, 0),
          invalidRows: batch.mealOccurrences.filter(row => !row.included).reduce((sum, row) => sum + row.mealQuantity, 0),
          totalAmount: total,
        },
      });
      return tx.foodBatch.findUniqueOrThrow({
        where: { id: batchId },
        include: {
          administrativeEntity: true,
          financialRecord: true,
          allocations: { orderBy: { sourceRow: "asc" } },
          mealOccurrences: { orderBy: { sourceRow: "asc" } },
          issues: true,
          revisions: { orderBy: { revision: "desc" } },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
