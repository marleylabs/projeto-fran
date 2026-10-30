import "server-only";
// Criação da obrigação financeira (FinancialRecord = conta a pagar) usada por todos os benefícios
// (Alimentação, Vale Transporte, Café da Manhã, Cesta Básica, Plano de Saúde, Treinamentos) e pela
// rota /api/financial-records. Cada obrigação recebe um identificador sequencial por ano: PG-AAAA-NNNNNN.
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";

/** Monta o identificador legível da obrigação, ex.: (2026, 42) → "PG-2026-000042". */
export function formatFinancialIdentifier(year: number, sequence: number) {
  return `PG-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Dados mínimos da obrigação: entidade administrativa (fornecedor/operadora), valor bruto em Decimal e autor. */
export type CreateFinancialRecordInput = {
  administrativeEntityId: string;
  grossAmount: Prisma.Decimal;
  createdByUserId: string;
};

/** Lançado quando a entidade administrativa informada não existe (rotas convertem em 4xx). */
export class InvalidAdministrativeEntityError extends Error {}

/**
 * Cria a obrigação dentro de uma transação já aberta (os módulos de benefício a criam junto com o lote/mapa).
 * Numeração: garante a linha do ano em FinancialSequence (upsert) e incrementa nextNumber; o número usado é o
 * valor anterior ao incremento. Exige isolamento Serializable na transação chamadora para não duplicar números.
 * O ano é o ano UTC da criação (não o da competência).
 * Lança InvalidAdministrativeEntityError se a entidade não existe.
 */
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

/** Atalho que abre sua própria transação Serializable para criar uma obrigação avulsa. */
export async function createFinancialRecord(input: CreateFinancialRecordInput) {
  return prisma.$transaction((tx) => createFinancialRecordInTransaction(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
