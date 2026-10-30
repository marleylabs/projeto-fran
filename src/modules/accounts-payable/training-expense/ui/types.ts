// Tipos de EXIBIÇÃO das Despesas de Treinamento (lançamentos, rateio por setor e resumo). Sem regra: valores, status e
// rateio vêm calculados do servidor. O rateio de treinamento é um sistema próprio (Fornecedor → Departamento →
// participantes), sem Empresa nem as quatro perspectivas dos benefícios.
import type { StatusTone } from "@/components/ui";

// Decimais chegam como texto (JSON de Prisma.Decimal); datas como ISO.
/** Fornecedor (cadastro administrativo) usado nos filtros e no registro. */
export type Supplier = { id: string; tradeName: string };
/** Treinamento ativo do catálogo: quantity = alunos incluídos no preço base; additionalStudentPrice = por aluno excedente. */
export type TrainingOption ={ id: string; description: string; modality: string; attendanceType: string; duration: string | null; quantity: number; unitPrice: string; additionalStudentPrice: string };

/** DRAFT = rascunho sem obrigação; COMPLETED = obrigação gerada; CANCELLED = cancelado (soft). */
export type ExpenseStatus = "DRAFT" | "COMPLETED" | "CANCELLED";
/** Linha da lista (GET .../training-expense). */
export type ExpenseListItem = {
  id: string;
  trainingDate: string;
  participantCount: number;
  finalAmount: string;
  status: ExpenseStatus;
  training: { id: string; description: string; modality: string; attendanceType: string };
  supplier: { id: string; tradeName: string };
  competence: { year: number; month: number };
};

/** Participante com o valor rateado e o snapshot de setor/CC; Revision = auditoria de edições pós-conclusão. */
export type Participant = { id: string; employeeId: string; department: string; costCenter: string; allocatedAmount: string; employee: { officialName: string } };
export type Revision = { id: string; revision: number; previousTotal: string; newTotal: string; createdAt: string };
/** Detalhe (GET .../training-expense/[id]) com snapshots de preço, valores e obrigação. */
export type ExpenseDetail = ExpenseListItem & {
  baseQuantitySnapshot: number;
  unitPriceSnapshot: string;
  additionalStudentPriceSnapshot: string;
  calculatedAmount: string;
  adjustmentReason: string | null;
  cancellationReason: string | null;
  financialRecord: { id: string; identifier: string; grossAmount: string } | null;
  participants: Participant[];
  revisions: Revision[];
};

/** Cor e rótulo do StatusBadge por status. */
export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, StatusTone> = { DRAFT: "pending", COMPLETED: "success", CANCELLED: "neutral" };
export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = { DRAFT: "Rascunho", COMPLETED: "Concluído", CANCELLED: "Cancelado" };

/** Versões serializadas dos tipos de rateio de server.ts (GET .../training-expense/rateio). */
export type RateioRowData ={ participantId: string; expenseId: string; employeeName: string; costCenter: string; trainingDescription: string; trainingDate: string; amount: string };
export type RateioDepartmentData = { department: string; participants: number; uniqueParticipants: number; amount: string; rows: RateioRowData[] };
export type RateioExpenseData = { id: string; trainingDescription: string; trainingDate: string; finalAmount: string; allocated: string; financialIdentifier: string | null };
export type RateioCardData = {
  supplierId: string; supplierName: string; competence: { year: number; month: number };
  expenses: RateioExpenseData[]; departments: RateioDepartmentData[];
  trainings: number; uniqueParticipants: number; participations: number;
  totalAmount: string; totalAllocated: string; difference: string;
};
export type RateioData = { cards: RateioCardData[]; totalAmount: string; totalAllocated: string; difference: string };

/** Resposta de GET .../training-expense/summary (getTrainingExpenseSummary). */
export type SummaryData ={ trainingsRealized: number; uniqueParticipants: number; participations: number; suppliers: number; valueTotal: string; bySupplier: { label: string; amount: string }[]; byTraining: { label: string; amount: string }[]; byDepartment: { label: string; amount: string }[] };
