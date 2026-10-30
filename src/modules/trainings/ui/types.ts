// Tipos de EXIBIÇÃO do catálogo de treinamentos (por fornecedor/proposta). Sem regra: o servidor valida e grava.
// Treinamento como devolvido por /api/trainings (valores monetários como texto decimal; origin IMPORTED = veio de proposta).
export type Training = {
  id: string;
  description: string;
  trainingType: string | null;
  duration: string | null;
  modality: string;
  attendanceType: string;
  additionalStudentPrice: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  active: boolean;
  origin: "IMPORTED" | "MANUAL";
  supplier: { id: string; legalName: string; tradeName: string };
  proposal: { id: string; proposalNumber: string; proposalDate: string | null } | null;
};

// Opções dos seletores do cadastro manual (fornecedor e proposta do fornecedor).
export type Supplier = { id: string; tradeName: string };
export type Proposal = { id: string; proposalNumber: string };

/** Campos editáveis (edição e criação). Valores monetários ficam como TEXTO decimal, enviado ao servidor como antes. */
export type TrainingForm = { description: string; modality: string; attendanceType: string; additionalStudentPrice: string; quantity: string; unitPrice: string; totalPrice: string };
// Formulário de criação: inclui fornecedor, proposta opcional ("" = sem proposta), tipo, duração e situação inicial.
export type NewTrainingForm = TrainingForm & { supplierId: string; proposalId: string; trainingType: string; duration: string; active: "true" | "false" };
