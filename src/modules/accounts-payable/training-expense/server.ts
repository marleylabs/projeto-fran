import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import { calculateTrainingExpenseAmount, distributeAmountAcrossParticipants } from "./calculations";
import { TrainingExpenseValidationError, type CreateTrainingExpenseInput, type UpdateTrainingExpenseInput } from "./schema";

type Tx = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  training: true,
  supplier: true,
  competence: true,
  financialRecord: true,
  participants: { include: { employee: true }, orderBy: { createdAt: "asc" as const } },
  revisions: { orderBy: { revision: "desc" as const } },
};

function assertDeletable(record: { lifecycleState: string; paymentState: string; reconciliationState: string; accountingState: string } | null) {
  if (!record) return;
  if (record.lifecycleState !== "ACTIVE" || record.paymentState !== "PENDING" || record.reconciliationState !== "PENDING" || record.accountingState !== "PENDING") {
    throw new TrainingExpenseValidationError("Este lançamento já avançou no fluxo financeiro e não pode ser alterado/cancelado diretamente.");
  }
}

async function loadActiveEmployees(tx: Tx, employeeIds: string[]) {
  const employees = await tx.foodEmployee.findMany({ where: { id: { in: employeeIds }, active: true } });
  if (employees.length !== employeeIds.length) {
    throw new TrainingExpenseValidationError("Um ou mais colaboradores selecionados não estão ativos ou não foram encontrados no Cadastro Mestre.");
  }
  return employees;
}

// Recalcula quantidade/valor/rateio a partir de uma lista de participantes —
// usado tanto na criação quanto em qualquer edição (draft ou pós-conclusão),
// garantindo que os três nunca fiquem fora de sincronia entre si.
async function buildParticipants(tx: Tx, employeeIds: string[], finalAmount: Prisma.Decimal) {
  const employees = await loadActiveEmployees(tx, employeeIds);
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const orderedIds = [...employeeIds].sort();
  const shares = distributeAmountAcrossParticipants(finalAmount, orderedIds);
  return shares.map((share) => {
    const employee = byId.get(share.employeeId)!;
    return {
      employeeId: employee.id,
      department: employee.department,
      costCenter: employee.costCenter,
      allocatedAmount: share.amount,
    };
  });
}

export async function createTrainingExpenseDraft(input: CreateTrainingExpenseInput & { userId: string }) {
  return prisma.$transaction(async (tx) => {
    const training = await tx.training.findUnique({ where: { id: input.trainingId } });
    if (!training || !training.active) throw new TrainingExpenseValidationError("Treinamento não encontrado ou inativo no catálogo.");

    const trainingDate = new Date(`${input.trainingDate}T00:00:00.000Z`);
    const participantCount = input.employeeIds.length;
    const calculatedAmount = calculateTrainingExpenseAmount(
      { baseQuantitySnapshot: training.quantity, unitPriceSnapshot: training.unitPrice, additionalStudentPriceSnapshot: training.additionalStudentPrice },
      participantCount
    );
    const participants = await buildParticipants(tx, input.employeeIds, calculatedAmount);

    const competence = await tx.trainingExpenseCompetence.upsert({
      where: { year_month: { year: input.year, month: input.month } },
      create: { year: input.year, month: input.month },
      update: {},
    });

    return tx.trainingExpense.create({
      data: {
        competenceId: competence.id,
        trainingId: training.id,
        supplierId: training.supplierId,
        trainingDate,
        participantCount,
        baseQuantitySnapshot: training.quantity,
        unitPriceSnapshot: training.unitPrice,
        additionalStudentPriceSnapshot: training.additionalStudentPrice,
        calculatedAmount,
        finalAmount: calculatedAmount,
        status: "DRAFT",
        createdByUserId: input.userId,
        participants: { create: participants },
      },
      include: DETAIL_INCLUDE,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

// Só permitido enquanto DRAFT — livre para recalcular participantes/valor
// final sem necessidade de Revision (ainda não existe FinancialRecord).
export async function updateTrainingExpenseDraft(id: string, input: UpdateTrainingExpenseInput) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.trainingExpense.findUnique({ where: { id }, include: { training: true } });
    if (!expense) throw new TrainingExpenseValidationError("Lançamento não encontrado.");
    if (expense.status !== "DRAFT") throw new TrainingExpenseValidationError("Só é possível editar livremente um lançamento em rascunho.");

    const employeeIds = input.employeeIds ?? (await tx.trainingExpenseParticipant.findMany({ where: { trainingExpenseId: id }, select: { employeeId: true } })).map((row) => row.employeeId);
    const participantCount = employeeIds.length;
    const calculatedAmount = calculateTrainingExpenseAmount(
      { baseQuantitySnapshot: expense.baseQuantitySnapshot, unitPriceSnapshot: expense.unitPriceSnapshot, additionalStudentPriceSnapshot: expense.additionalStudentPriceSnapshot },
      participantCount
    );
    const finalAmount = input.finalAmount !== undefined ? new Prisma.Decimal(input.finalAmount) : calculatedAmount;
    if (!finalAmount.equals(calculatedAmount) && !input.adjustmentReason && !expense.adjustmentReason) {
      throw new TrainingExpenseValidationError("Informe a justificativa do ajuste quando o valor final divergir do valor calculado.");
    }

    const participants = await buildParticipants(tx, employeeIds, finalAmount);
    await tx.trainingExpenseParticipant.deleteMany({ where: { trainingExpenseId: id } });

    return tx.trainingExpense.update({
      where: { id },
      data: {
        trainingDate: input.trainingDate ? new Date(`${input.trainingDate}T00:00:00.000Z`) : undefined,
        participantCount,
        calculatedAmount,
        finalAmount,
        adjustmentReason: input.adjustmentReason !== undefined ? input.adjustmentReason : (finalAmount.equals(calculatedAmount) ? null : expense.adjustmentReason),
        participants: { create: participants },
      },
      include: DETAIL_INCLUDE,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

// Transição DRAFT → COMPLETED — revalida tudo do zero (nunca confia em
// estado potencialmente desatualizado) e cria o FinancialRecord pelo mesmo
// kernel usado por Food/Transit Voucher.
export async function completeTrainingExpense(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.trainingExpense.findUnique({ where: { id }, include: { participants: true } });
    if (!expense) throw new TrainingExpenseValidationError("Lançamento não encontrado.");
    if (expense.status !== "DRAFT") throw new TrainingExpenseValidationError("Somente lançamentos em rascunho podem ser concluídos.");

    if (expense.participants.length < 1) throw new TrainingExpenseValidationError("Inclua ao menos um participante antes de concluir.");
    if (expense.participantCount !== expense.participants.length) throw new TrainingExpenseValidationError("Quantidade de participantes divergente da lista real — recarregue e tente novamente.");
    const uniqueEmployees = new Set(expense.participants.map((row) => row.employeeId));
    if (uniqueEmployees.size !== expense.participants.length) throw new TrainingExpenseValidationError("Há colaborador duplicado entre os participantes.");
    const sumAllocated = expense.participants.reduce((sum, row) => sum.add(row.allocatedAmount), new Prisma.Decimal(0));
    if (!sumAllocated.equals(expense.finalAmount)) throw new TrainingExpenseValidationError(`Erro de integridade no rateio: soma dos participantes (${sumAllocated.toFixed(2)}) diverge do valor final (${expense.finalAmount.toFixed(2)}).`);
    if (!expense.finalAmount.equals(expense.calculatedAmount) && !expense.adjustmentReason) {
      throw new TrainingExpenseValidationError("Valor final diverge do valor calculado — informe a justificativa do ajuste antes de concluir.");
    }

    const record = await createFinancialRecordInTransaction(tx, {
      administrativeEntityId: expense.supplierId,
      grossAmount: expense.finalAmount,
      createdByUserId: userId,
    });

    return tx.trainingExpense.update({
      where: { id },
      data: { status: "COMPLETED", financialRecordId: record.id },
      include: DETAIL_INCLUDE,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

// Edição pós-conclusão: só permitida se o FinancialRecord vinculado ainda
// está no estado inicial (mesma guarda usada por Food/Transit para decidir
// se uma alteração financeira ainda é segura) — mesmo padrão de
// editTransitVoucherMap (atualiza FinancialRecord.grossAmount direto), mais
// TrainingExpenseRevision para auditoria (padrão FoodBatchRevision).
export async function editCompletedTrainingExpense(id: string, input: UpdateTrainingExpenseInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.trainingExpense.findUnique({ where: { id }, include: { financialRecord: true, participants: true } });
    if (!expense) throw new TrainingExpenseValidationError("Lançamento não encontrado.");
    if (expense.status !== "COMPLETED") throw new TrainingExpenseValidationError("Somente lançamentos concluídos usam este fluxo de edição.");
    assertDeletable(expense.financialRecord);

    const employeeIds = input.employeeIds ?? expense.participants.map((row) => row.employeeId);
    const participantCount = employeeIds.length;
    const calculatedAmount = calculateTrainingExpenseAmount(
      { baseQuantitySnapshot: expense.baseQuantitySnapshot, unitPriceSnapshot: expense.unitPriceSnapshot, additionalStudentPriceSnapshot: expense.additionalStudentPriceSnapshot },
      participantCount
    );
    const finalAmount = input.finalAmount !== undefined ? new Prisma.Decimal(input.finalAmount) : calculatedAmount;
    const adjustmentReason = input.adjustmentReason !== undefined ? input.adjustmentReason : expense.adjustmentReason;
    if (!finalAmount.equals(calculatedAmount) && !adjustmentReason) {
      throw new TrainingExpenseValidationError("Informe a justificativa do ajuste quando o valor final divergir do valor calculado.");
    }

    const participants = await buildParticipants(tx, employeeIds, finalAmount);
    await tx.trainingExpenseParticipant.deleteMany({ where: { trainingExpenseId: id } });

    const previousTotal = expense.finalAmount;
    const updated = await tx.trainingExpense.update({
      where: { id },
      data: {
        trainingDate: input.trainingDate ? new Date(`${input.trainingDate}T00:00:00.000Z`) : undefined,
        participantCount,
        calculatedAmount,
        finalAmount,
        adjustmentReason,
        participants: { create: participants },
      },
      include: DETAIL_INCLUDE,
    });

    if (expense.financialRecordId) {
      await tx.financialRecord.update({ where: { id: expense.financialRecordId }, data: { grossAmount: finalAmount } });
    }

    const lastRevision = await tx.trainingExpenseRevision.findFirst({ where: { trainingExpenseId: id }, orderBy: { revision: "desc" } });
    await tx.trainingExpenseRevision.create({
      data: {
        trainingExpenseId: id,
        editedByUserId: userId,
        revision: (lastRevision?.revision ?? 0) + 1,
        previousTotal,
        newTotal: finalAmount,
        changes: {
          trainingDate: input.trainingDate ?? undefined,
          employeeIds: input.employeeIds ?? undefined,
          adjustmentReason: adjustmentReason ?? undefined,
        } as Prisma.InputJsonValue,
      },
    });

    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

// Soft cancel — nunca DELETE físico, mesmo padrão de cancelFoodBatch/cancelTransitMap.
export async function cancelTrainingExpense(id: string, reason: string, userId: string) {
  if (!reason.trim()) throw new TrainingExpenseValidationError("Informe o motivo do cancelamento.");
  return prisma.$transaction(async (tx) => {
    const expense = await tx.trainingExpense.findUnique({ where: { id }, include: { financialRecord: true } });
    if (!expense) throw new TrainingExpenseValidationError("Lançamento não encontrado.");
    if (expense.status === "CANCELLED") throw new TrainingExpenseValidationError("Este lançamento já está cancelado.");
    assertDeletable(expense.financialRecord);

    if (expense.financialRecordId) {
      await tx.financialRecord.update({ where: { id: expense.financialRecordId }, data: { grossAmount: 0, lifecycleState: "CANCELLED", paymentState: "CANCELLED" } });
    }
    return tx.trainingExpense.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: userId, cancellationReason: reason.trim() },
      include: DETAIL_INCLUDE,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type TrainingExpenseListFilters = {
  year?: number;
  month?: number;
  supplierId?: string;
  trainingId?: string;
  status?: "DRAFT" | "COMPLETED" | "CANCELLED";
  query?: string;
};

function competenceWhere(filters: TrainingExpenseListFilters) {
  if (filters.year === undefined || filters.month === undefined) return undefined;
  return { competence: { year: filters.year, month: filters.month } };
}

export async function listTrainingExpenses(filters: TrainingExpenseListFilters) {
  return prisma.trainingExpense.findMany({
    where: {
      ...competenceWhere(filters),
      supplierId: filters.supplierId,
      trainingId: filters.trainingId,
      status: filters.status,
      ...(filters.query ? { training: { description: { contains: filters.query, mode: "insensitive" } } } : {}),
    },
    include: { training: { select: { id: true, description: true, modality: true, attendanceType: true } }, supplier: { select: { id: true, tradeName: true } }, competence: true },
    orderBy: [{ trainingDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getTrainingExpenseDetail(id: string) {
  return prisma.trainingExpense.findUnique({ where: { id }, include: DETAIL_INCLUDE });
}

export type RateioRow = {
  participantId: string;
  expenseId: string;
  employeeId: string;
  employeeName: string;
  costCenter: string;
  trainingDescription: string;
  trainingDate: Date;
  amount: Prisma.Decimal;
};
export type RateioDepartment = { department: string; participants: number; uniqueParticipants: number; amount: Prisma.Decimal; rows: RateioRow[] };
export type RateioExpense = { id: string; trainingDescription: string; trainingDate: Date; finalAmount: Prisma.Decimal; allocated: Prisma.Decimal; financialIdentifier: string | null; status: string };
export type RateioSupplierCard = {
  supplierId: string;
  supplierName: string;
  competence: { year: number; month: number };
  expenses: RateioExpense[];
  departments: RateioDepartment[];
  trainings: number;
  uniqueParticipants: number;
  participations: number;
  totalAmount: Prisma.Decimal;
  totalAllocated: Prisma.Decimal;
  difference: Prisma.Decimal;
};

// Só leitura/consolidação: 1 card por fornecedor na competência; cada
// TrainingExpense (e seu FinancialRecord) continua individual e rastreável.
export async function getTrainingExpenseRateio(filters: TrainingExpenseListFilters) {
  const expenses = await prisma.trainingExpense.findMany({
    where: { ...competenceWhere(filters), supplierId: filters.supplierId, trainingId: filters.trainingId, status: "COMPLETED" },
    include: {
      supplier: { select: { id: true, tradeName: true } },
      competence: true,
      training: { select: { description: true } },
      financialRecord: { select: { identifier: true } },
      participants: { include: { employee: { select: { officialName: true } } } },
    },
    orderBy: [{ trainingDate: "asc" }, { createdAt: "asc" }],
  });

  const zero = () => new Prisma.Decimal(0);
  const cards = new Map<string, RateioSupplierCard>();
  for (const expense of expenses) {
    const key = `${expense.supplierId}:${expense.competence.year}-${expense.competence.month}`;
    const card = cards.get(key) ?? {
      supplierId: expense.supplierId, supplierName: expense.supplier.tradeName,
      competence: { year: expense.competence.year, month: expense.competence.month },
      expenses: [], departments: [], trainings: 0, uniqueParticipants: 0, participations: 0,
      totalAmount: zero(), totalAllocated: zero(), difference: zero(),
    };
    const allocated = expense.participants.reduce((sum, row) => sum.add(row.allocatedAmount), zero());
    card.expenses.push({ id: expense.id, trainingDescription: expense.training.description, trainingDate: expense.trainingDate, finalAmount: expense.finalAmount, allocated, financialIdentifier: expense.financialRecord?.identifier ?? null, status: expense.status });
    card.trainings += 1;
    card.totalAmount = card.totalAmount.add(expense.finalAmount);
    for (const participant of expense.participants) {
      let department = card.departments.find((entry) => entry.department === participant.department);
      if (!department) { department = { department: participant.department, participants: 0, uniqueParticipants: 0, amount: zero(), rows: [] }; card.departments.push(department); }
      department.participants += 1;
      department.amount = department.amount.add(participant.allocatedAmount);
      department.rows.push({ participantId: participant.id, expenseId: expense.id, employeeId: participant.employeeId, employeeName: participant.employee.officialName, costCenter: participant.costCenter, trainingDescription: expense.training.description, trainingDate: expense.trainingDate, amount: participant.allocatedAmount });
    }
    cards.set(key, card);
  }

  const result = [...cards.values()].map((card) => {
    card.departments.sort((a, b) => a.department.localeCompare(b.department, "pt-BR"));
    for (const department of card.departments) {
      department.uniqueParticipants = new Set(department.rows.map((row) => row.employeeId)).size;
      department.rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "pt-BR") || a.trainingDate.getTime() - b.trainingDate.getTime());
    }
    card.uniqueParticipants = new Set(card.departments.flatMap((department) => department.rows.map((row) => row.employeeId))).size;
    card.participations = card.departments.reduce((sum, department) => sum + department.participants, 0);
    card.totalAllocated = card.departments.reduce((sum, department) => sum.add(department.amount), zero());
    card.difference = card.totalAmount.sub(card.totalAllocated);
    return card;
  }).sort((a, b) => a.supplierName.localeCompare(b.supplierName, "pt-BR"));

  const totalAmount = result.reduce((sum, card) => sum.add(card.totalAmount), zero());
  const totalAllocated = result.reduce((sum, card) => sum.add(card.totalAllocated), zero());
  return { cards: result, totalAmount, totalAllocated, difference: totalAmount.sub(totalAllocated) };
}

// Redistribui o MESMO finalAmount entre os participantes existentes — nunca
// altera o valor total nem o conjunto de participantes. Em lançamento
// concluído, mesma guarda financeira das demais edições + Revision com a
// distribuição anterior e a nova.
export async function editTrainingExpenseAllocation(id: string, rows: Array<{ participantId: string; allocatedAmount: string }>, userId: string) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.trainingExpense.findUnique({ where: { id }, include: { participants: true, financialRecord: true } });
    if (!expense) throw new TrainingExpenseValidationError("Lançamento não encontrado.");
    if (expense.status === "CANCELLED") throw new TrainingExpenseValidationError("Lançamento cancelado não pode ser alterado.");
    if (expense.status === "COMPLETED") assertDeletable(expense.financialRecord);

    const expected = new Set(expense.participants.map((row) => row.id));
    if (rows.length !== expected.size || new Set(rows.map((row) => row.participantId)).size !== rows.length || rows.some((row) => !expected.has(row.participantId))) {
      throw new TrainingExpenseValidationError("O conjunto de participantes editados não corresponde ao lançamento.");
    }
    const parsed = rows.map((row) => {
      let amount: Prisma.Decimal;
      try { amount = new Prisma.Decimal(String(row.allocatedAmount).replace(",", ".")); } catch { throw new TrainingExpenseValidationError("Valores de rateio inválidos."); }
      if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) throw new TrainingExpenseValidationError("Cada valor rateado deve ser positivo, com no máximo 2 casas decimais.");
      return { participantId: row.participantId, amount };
    });
    const informed = parsed.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
    if (!informed.equals(expense.finalAmount)) {
      throw new TrainingExpenseValidationError(`Total esperado ${expense.finalAmount.toFixed(2)}, total informado ${informed.toFixed(2)}, diferença ${expense.finalAmount.sub(informed).toFixed(2)}.`);
    }

    const previous = expense.participants.map((row) => ({ participantId: row.id, employeeId: row.employeeId, amount: row.allocatedAmount.toFixed(2) }));
    for (const row of parsed) await tx.trainingExpenseParticipant.update({ where: { id: row.participantId }, data: { allocatedAmount: row.amount } });

    if (expense.status === "COMPLETED") {
      const last = await tx.trainingExpenseRevision.findFirst({ where: { trainingExpenseId: id }, orderBy: { revision: "desc" } });
      const byId = new Map(expense.participants.map((row) => [row.id, row]));
      await tx.trainingExpenseRevision.create({
        data: {
          trainingExpenseId: id, editedByUserId: userId, revision: (last?.revision ?? 0) + 1,
          previousTotal: expense.finalAmount, newTotal: expense.finalAmount,
          changes: { type: "ALLOCATION", previous, next: parsed.map((row) => ({ participantId: row.participantId, employeeId: byId.get(row.participantId)!.employeeId, amount: row.amount.toFixed(2) })) } as Prisma.InputJsonValue,
        },
      });
    }
    return tx.trainingExpense.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getTrainingExpenseSummary(filters: TrainingExpenseListFilters) {
  const expenses = await prisma.trainingExpense.findMany({
    where: { ...competenceWhere(filters), status: "COMPLETED" },
    include: { participants: true, training: { select: { description: true } }, supplier: { select: { tradeName: true } } },
  });

  const uniqueParticipants = new Set<string>();
  let participations = 0;
  let valueTotal = new Prisma.Decimal(0);
  const bySupplier = new Map<string, Prisma.Decimal>();
  const byTraining = new Map<string, Prisma.Decimal>();
  const byDepartment = new Map<string, Prisma.Decimal>();
  const suppliers = new Set<string>();

  for (const expense of expenses) {
    valueTotal = valueTotal.add(expense.finalAmount);
    suppliers.add(expense.supplier.tradeName);
    bySupplier.set(expense.supplier.tradeName, (bySupplier.get(expense.supplier.tradeName) ?? new Prisma.Decimal(0)).add(expense.finalAmount));
    byTraining.set(expense.training.description, (byTraining.get(expense.training.description) ?? new Prisma.Decimal(0)).add(expense.finalAmount));
    for (const participant of expense.participants) {
      uniqueParticipants.add(participant.employeeId);
      participations += 1;
      byDepartment.set(participant.department, (byDepartment.get(participant.department) ?? new Prisma.Decimal(0)).add(participant.allocatedAmount));
    }
  }

  const toRows = (map: Map<string, Prisma.Decimal>) => [...map.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount.comparedTo(a.amount));

  return {
    trainingsRealized: expenses.length,
    uniqueParticipants: uniqueParticipants.size,
    participations,
    suppliers: suppliers.size,
    valueTotal,
    bySupplier: toRows(bySupplier),
    byTraining: toRows(byTraining),
    byDepartment: toRows(byDepartment),
  };
}
