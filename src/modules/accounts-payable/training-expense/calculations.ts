import { Prisma } from "@/generated/prisma";
// Cálculo puro das Despesas de Treinamento (sem banco): valor do evento a partir do snapshot de preço do catálogo
// e divisão do valor final entre participantes. Usado por server.ts. Dinheiro sempre em Prisma.Decimal; o rateio
// trabalha em centavos inteiros para nunca perder/sobrar centavo.

/** Erro de regra de cálculo; não é tratado como 400 pelas rotas (só TrainingExpenseValidationError é). */
export class TrainingExpenseCalculationError extends Error {}

/**
 * Preços copiados do Training (catálogo) para o lançamento no momento da criação. Edições posteriores do catálogo
 * não alteram lançamentos existentes: os recálculos usam sempre estes snapshots.
 */
export type TrainingExpenseSnapshot = {
  baseQuantitySnapshot: number;
  unitPriceSnapshot: Prisma.Decimal;
  additionalStudentPriceSnapshot: Prisma.Decimal;
};

// valor base = unitPriceSnapshot (preço do treinamento em si, para até a
// quantidade base de alunos) + valor dos participantes que excedem a
// quantidade base, cada um cobrado pelo "valor adicional por aluno" — dois
// conceitos do orçamento que nunca são intercambiáveis (ver Training.additionalStudentPrice).
export function calculateTrainingExpenseAmount(snapshot: TrainingExpenseSnapshot, participantCount: number): Prisma.Decimal {
  if (!Number.isInteger(participantCount) || participantCount < 1) {
    throw new TrainingExpenseCalculationError("A quantidade de participantes deve ser um número inteiro maior que zero.");
  }
  const additionalParticipants = participantCount - snapshot.baseQuantitySnapshot;
  const additionalAmount = additionalParticipants > 0
    ? snapshot.additionalStudentPriceSnapshot.mul(additionalParticipants)
    : new Prisma.Decimal(0);
  return snapshot.unitPriceSnapshot.add(additionalAmount);
}

/** Parcela de um participante (Decimal com 2 casas). */
export type ParticipantShare ={ employeeId: string; amount: Prisma.Decimal };

// Divide o valor total do evento entre os participantes de forma determinística:
// valor médio (arredondado para baixo, 2 casas) para todos, e o resto (sempre
// alguns centavos, nunca mais que participantCount-1 centavos) distribuído um
// centavo a mais para os primeiros participantes da lista, na ordem recebida
// (o chamador deve ordenar de forma estável, ex.: por employeeId) — garante
// SUM(allocatedAmount) === finalAmount sempre, sem exceção.
export function distributeAmountAcrossParticipants(totalAmount: Prisma.Decimal, employeeIds: string[]): ParticipantShare[] {
  if (!employeeIds.length) {
    throw new TrainingExpenseCalculationError("Informe ao menos um participante para ratear o valor.");
  }
  const totalCents = totalAmount.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const count = new Prisma.Decimal(employeeIds.length);
  const baseCents = totalCents.divToInt(count);
  const remainderCents = totalCents.mod(count).toNumber();

  const shares = employeeIds.map((employeeId, index) => {
    const cents = index < remainderCents ? baseCents.add(1) : baseCents;
    return { employeeId, amount: cents.div(100) };
  });

  // Rede de segurança: se totalAmount tiver mais de 2 casas, o arredondamento em centavos não fecha e o erro aparece aqui.
  const sum = shares.reduce((acc, share) => acc.add(share.amount), new Prisma.Decimal(0));
  if (!sum.equals(totalAmount)) {
    throw new TrainingExpenseCalculationError(
      `Erro de integridade no rateio: soma dos participantes (${sum.toFixed(2)}) diverge do valor final (${totalAmount.toFixed(2)}).`
    );
  }
  return shares;
}
