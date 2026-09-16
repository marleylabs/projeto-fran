import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import {
  removePrivateFile,
  sanitizeOriginalName,
  storePrivateFile,
} from "@/modules/documents/server/privateStorage";
import {
  FoodBatchValidationError,
  MAX_FOOD_FILE_SIZE,
  resolveFoodUnitPrice,
} from "./server";
import { localityAllows } from "./processing";
import { matchFoodEmployee } from "./matching";
import { normalizeFoodDepartment, normalizeFoodName } from "./ma-processing";
import { parseFoodPaXlsx } from "./pa-processing";

const normalizeEntityName = (value: string) =>
  normalizeFoodName(value)
    .replace(/\b(ltda|eireli|me|sa)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
export async function processFoodPaDraft(input: {
  year: number;
  month: number;
  administrativeEntityId: string;
  userId: string;
  file: File;
}) {
  if (
    !Number.isInteger(input.year) ||
    input.year < 2000 ||
    input.year > 2200 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  )
    throw new FoodBatchValidationError("Competência inválida.");
  if (
    input.file.size <= 0 ||
    input.file.size > MAX_FOOD_FILE_SIZE ||
    !input.file.name.toLowerCase().endsWith(".xlsx")
  )
    throw new FoodBatchValidationError(
      "Envie o arquivo XLSX do rateio PA com até 10 MB.",
    );
  const entity = await prisma.administrativeEntity.findUnique({
    where: { id: input.administrativeEntityId },
  });
  if (!entity || !localityAllows(entity.locality, "PA"))
    throw new FoodBatchValidationError(
      "Fornecedor não encontrado ou não habilitado para PA.",
    );
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b))
    throw new FoodBatchValidationError(
      "O arquivo XLSX possui assinatura inválida.",
    );
  const parsed = await parseFoodPaXlsx(buffer);
  if (!parsed.occurrences.length)
    throw new FoodBatchValidationError(
      parsed.issues[0]?.message ??
        "Nenhuma ocorrência válida encontrada na tabela RateioOficial.",
    );
  const fileCompetences = [
    ...new Set(
      parsed.occurrences.map(
        (row) =>
          `${row.occurredOn.getUTCFullYear()}-${String(row.occurredOn.getUTCMonth() + 1).padStart(2, "0")}`,
      ),
    ),
  ];
  if (fileCompetences.length !== 1)
    throw new FoodBatchValidationError(
      `O arquivo possui registros de ${fileCompetences.length} competências diferentes (${fileCompetences.join(", ")}). Separe o rateio por competência antes do upload.`,
    );
  const [derivedYear, derivedMonth] = fileCompetences[0].split("-").map(Number);
  const restaurantNames = [
    ...new Set(
      parsed.occurrences.map((row) => normalizeEntityName(row.restaurantName)),
    ),
  ];
  const entityNames = [entity.tradeName, entity.legalName].map(
    normalizeEntityName,
  );
  if (restaurantNames.length !== 1 || !entityNames.includes(restaurantNames[0]))
    throw new FoodBatchValidationError(
      `O restaurante ${parsed.occurrences[0].restaurantName} não corresponde com segurança ao fornecedor selecionado em Cadastros.`,
    );
  let hasConfiguredPrice = true;
  let configuredPrice: Prisma.Decimal;
  try {
    configuredPrice = await resolveFoodUnitPrice(
      derivedYear,
      derivedMonth,
      "PA",
      input.administrativeEntityId,
    );
  } catch (error) {
    if (!(error instanceof FoodBatchValidationError)) throw error;
    hasConfiguredPrice = false;
    configuredPrice = new Prisma.Decimal(parsed.occurrences[0].amount);
  }
  const [employees, aliases] = await Promise.all([
    prisma.foodEmployee.findMany({ where: { active: true } }),
    prisma.foodEmployeeAlias.findMany({ include: { employee: true } }),
  ]);
  const matches = parsed.occurrences.map((occurrence) => ({
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
    const key = `${item.occurrence.occurredOn.toISOString().slice(0, 10)}|${item.employee?.id ?? item.occurrence.normalizedReceivedName}|${normalizeEntityName(item.occurrence.restaurantName)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const priceDivergences = hasConfiguredPrice
    ? parsed.occurrences.filter(
        (row) => !new Prisma.Decimal(row.amount).equals(configuredPrice),
      )
    : [];
  if (priceDivergences.length)
    parsed.issues.push({
      sourceRow: priceDivergences[0].sourceRow,
      employeeName: priceDivergences[0].receivedName,
      code: "PRICE_DIVERGENCE",
      message: `${priceDivergences.length} ocorrência(s) possuem VALOR diferente do valor configurado (${configuredPrice.toFixed(2)}). Os valores do Excel foram preservados para revisão.`,
    });
  const stored = await storePrivateFile(buffer);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const competence = await tx.foodCompetence.upsert({
          where: { year_month: { year: derivedYear, month: derivedMonth } },
          create: { year: derivedYear, month: derivedMonth },
          update: {},
        });
        const scope = {
          competenceId: competence.id,
          locality: "PA",
          administrativeEntityId: input.administrativeEntityId,
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
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const pending = new Set<string>();
        const rows = matches.map(({ occurrence, employee, method }) => {
          const duplicateCandidate =
            (counts.get(
              `${occurrence.occurredOn.toISOString().slice(0, 10)}|${employee?.id ?? occurrence.normalizedReceivedName}|${normalizeEntityName(occurrence.restaurantName)}`,
            ) ?? 0) > 1;
          const departmentMatches =
            employee &&
            normalizeFoodDepartment(employee.department) ===
              normalizeFoodDepartment(occurrence.receivedDepartment);
          const auto = Boolean(
            employee && departmentMatches && !duplicateCandidate,
          );
          if (!auto) pending.add(occurrence.normalizedReceivedName);
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
            invoiceEmission: occurrence.invoiceEmission,
            restaurantName: occurrence.restaurantName,
            duplicateCandidate,
            validationStatus: auto
              ? ("AUTO_MATCHED" as const)
              : ("PENDING" as const),
            matchMethod: method,
            unitPrice: new Prisma.Decimal(occurrence.amount),
            amount: new Prisma.Decimal(occurrence.amount),
          };
        });
        const batch = await tx.foodBatch.create({
          data: {
            ...scope,
            uploadedByUserId: input.userId,
            version: (last?.version ?? 0) + 1,
            status: "UNDER_REVIEW",
            originalName: sanitizeOriginalName(input.file.name),
            storageKey: stored.storageKey,
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sizeBytes: input.file.size,
            sha256: stored.sha256,
            unitPrice: configuredPrice,
            totalRows: parsed.totalRows,
            validRows: parsed.occurrences.length,
            invalidRows: pending.size + parsed.issues.length,
            totalAmount: new Prisma.Decimal(0),
            mealOccurrences: { create: rows },
            issues: { create: parsed.issues },
          },
        });
        return tx.foodBatch.findUniqueOrThrow({
          where: { id: batch.id },
          include: {
            competence: true,
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
