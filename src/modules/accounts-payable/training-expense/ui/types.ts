// Tipos de EXIBIÇÃO das Despesas de Treinamento (lançamentos, rateio por setor e resumo). Sem regra: valores, status e
// rateio vêm calculados do servidor. O rateio de treinamento é um sistema próprio (Fornecedor → Departamento →
// participantes), sem Empresa nem as quatro perspectivas dos benefícios.
import type { StatusTone } from "@/components/ui";

export type Supplier = { id: string; tradeName: string };
export type TrainingOption = { id: string; description: string; modality: string; attendanceType: string; duration: string | null; quantity: number; unitPrice: string; additionalStudentPrice: string };

export type ExpenseStatus = "DRAFT" | "COMPLETED" | "CANCELLED";
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

export type Participant = { id: string; employeeId: string; department: string; costCenter: string; allocatedAmount: string; employee: { officialName: string } };
export type Revision = { id: string; revision: number; previousTotal: string; newTotal: string; createdAt: string };
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

export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, StatusTone> = { DRAFT: "pending", COMPLETED: "success", CANCELLED: "neutral" };
export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = { DRAFT: "Rascunho", COMPLETED: "Concluído", CANCELLED: "Cancelado" };

export type RateioRowData = { participantId: string; expenseId: string; employeeName: string; costCenter: string; trainingDescription: string; trainingDate: string; amount: string };
export type RateioDepartmentData = { department: string; participants: number; uniqueParticipants: number; amount: string; rows: RateioRowData[] };
export type RateioExpenseData = { id: string; trainingDescription: string; trainingDate: string; finalAmount: string; allocated: string; financialIdentifier: string | null };
export type RateioCardData = {
  supplierId: string; supplierName: string; competence: { year: number; month: number };
  expenses: RateioExpenseData[]; departments: RateioDepartmentData[];
  trainings: number; uniqueParticipants: number; participations: number;
  totalAmount: string; totalAllocated: string; difference: string;
};
export type RateioData = { cards: RateioCardData[]; totalAmount: string; totalAllocated: string; difference: string };

export type SummaryData = { trainingsRealized: number; uniqueParticipants: number; participations: number; suppliers: number; valueTotal: string; bySupplier: { label: string; amount: string }[]; byTraining: { label: string; amount: string }[]; byDepartment: { label: string; amount: string }[] };
