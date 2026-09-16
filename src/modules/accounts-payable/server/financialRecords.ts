import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";

export function formatFinancialIdentifier(year: number, sequence: number) {
  return `PG-${year}-${String(sequence).padStart(6, "0")}`;
}

export type CreateFinancialRecordInput = {
  administrativeEntityId: string;
  grossAmount: Prisma.Decimal;
  createdByUserId: string;
};

export class InvalidAdministrativeEntityError extends Error {}

export async function createFinancialRecordInTransaction(tx: Prisma.TransactionClient, input: CreateFinancialRecordInput) {
  const year = new Date().getUTCFullYear();
  const entity = await tx.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId }, select: { id: true } });
  if (!entity) throw new InvalidAdministrativeEntityError("Cadastro não encontrado. Cadastre a entidade antes de criar a conta a pagar.");
  await tx.financialSequence.upsert({ where: { year }, create: { year, nextNumber: 1 }, update: {} });
  const sequence = await tx.financialSequence.update({ where: { year }, data: { nextNumber: { increment: 1 } } });
  const sequenceNumber = sequence.nextNumber - 1;
  return tx.financialRecord.create({
    data: { ...input, identifier: formatFinancialIdentifier(year, sequenceNumber), sequenceYear: year, sequenceNumber },
    include: { administrativeEntity: true },
  });
}

export async function createFinancialRecord(input: CreateFinancialRecordInput) {
  return prisma.$transaction((tx) => createFinancialRecordInTransaction(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
