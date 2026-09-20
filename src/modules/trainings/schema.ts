export class TrainingValidationError extends Error {}

export type ManualTrainingInput = {
  supplierId: string;
  proposalId: string | null;
  description: string;
  trainingType: string | null;
  duration: string | null;
  modality: string;
  attendanceType: string;
  additionalStudentPrice: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
};

function requiredText(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new TrainingValidationError(`${label} é obrigatório.`);
  return value.trim();
}

function requiredMoney(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" && typeof value !== "number") throw new TrainingValidationError(`${label} é obrigatório.`);
  const normalized = String(value).replace(",", ".").trim();
  if (!normalized || Number.isNaN(Number(normalized)) || Number(normalized) < 0) {
    throw new TrainingValidationError(`${label} deve ser um valor monetário válido.`);
  }
  return normalized;
}

// Cadastro manual (origin = MANUAL): fornecedor é sempre um AdministrativeEntity
// real (id resolvido no backend, nunca texto livre); proposta é opcional —
// um treinamento manual pode não ter proposta comercial formal.
export function parseManualTrainingInput(body: unknown): ManualTrainingInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TrainingValidationError("Corpo da requisição inválido.");
  }
  const input = body as Record<string, unknown>;
  const proposalIdRaw = input.proposalId;
  if (proposalIdRaw !== undefined && proposalIdRaw !== null && typeof proposalIdRaw !== "string") {
    throw new TrainingValidationError("Proposta inválida.");
  }
  return {
    supplierId: requiredText(input, "supplierId", "Fornecedor"),
    proposalId: (proposalIdRaw as string | null | undefined)?.trim() || null,
    description: requiredText(input, "description", "Descrição"),
    trainingType: (typeof input.trainingType === "string" ? input.trainingType.trim() : null) || null,
    duration: (typeof input.duration === "string" ? input.duration.trim() : null) || null,
    modality: requiredText(input, "modality", "Modalidade"),
    attendanceType: requiredText(input, "attendanceType", "Forma de atendimento"),
    additionalStudentPrice: requiredMoney(input, "additionalStudentPrice", "Valor adicional por aluno"),
    quantity: (() => {
      const value = input.quantity;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new TrainingValidationError("Quantidade base deve ser um número inteiro maior que zero.");
      }
      return value;
    })(),
    unitPrice: requiredMoney(input, "unitPrice", "Valor unitário"),
    totalPrice: requiredMoney(input, "totalPrice", "Valor total"),
  };
}

export type TrainingUpdateInput = {
  description?: string;
  trainingType?: string | null;
  duration?: string | null;
  modality?: string;
  attendanceType?: string;
  additionalStudentPrice?: string;
  quantity?: number;
  unitPrice?: string;
  totalPrice?: string;
};

function optionalText(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new TrainingValidationError(`Campo "${key}" inválido.`);
  return value.trim();
}

function optionalMoney(body: Record<string, unknown>, key: string, label: string): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TrainingValidationError(`${label} inválido.`);
  }
  const normalized = String(value).replace(",", ".").trim();
  if (!normalized || Number.isNaN(Number(normalized)) || Number(normalized) < 0) {
    throw new TrainingValidationError(`${label} deve ser um valor monetário válido.`);
  }
  return normalized;
}

export function parseTrainingUpdateInput(body: unknown): TrainingUpdateInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TrainingValidationError("Corpo da requisição inválido.");
  }
  const input = body as Record<string, unknown>;
  const result: TrainingUpdateInput = {};

  if ("description" in input) {
    const value = input.description;
    if (typeof value !== "string" || !value.trim()) throw new TrainingValidationError("Descrição é obrigatória.");
    result.description = value.trim();
  }
  if ("modality" in input) {
    const value = input.modality;
    if (typeof value !== "string" || !value.trim()) throw new TrainingValidationError("Modalidade é obrigatória.");
    result.modality = value.trim();
  }
  if ("attendanceType" in input) {
    const value = input.attendanceType;
    if (typeof value !== "string" || !value.trim()) throw new TrainingValidationError("Forma de atendimento é obrigatória.");
    result.attendanceType = value.trim();
  }
  if ("quantity" in input) {
    const value = input.quantity;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new TrainingValidationError("Quantidade deve ser um número inteiro maior que zero.");
    }
    result.quantity = value;
  }

  const trainingType = optionalText(input, "trainingType");
  if (trainingType !== undefined) result.trainingType = trainingType;
  const duration = optionalText(input, "duration");
  if (duration !== undefined) result.duration = duration;

  const additionalStudentPrice = optionalMoney(input, "additionalStudentPrice", "Valor adicional por aluno");
  if (additionalStudentPrice !== undefined) result.additionalStudentPrice = additionalStudentPrice;
  const unitPrice = optionalMoney(input, "unitPrice", "Valor unitário");
  if (unitPrice !== undefined) result.unitPrice = unitPrice;
  const totalPrice = optionalMoney(input, "totalPrice", "Valor total");
  if (totalPrice !== undefined) result.totalPrice = totalPrice;

  return result;
}
