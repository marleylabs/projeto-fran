/** Erro de entrada com mensagem exibível; as rotas devolvem 400 com `error.message`. */
// Validação das entradas do catálogo de Treinamentos (POST /api/trainings e PATCH /api/trainings/[id]).
// Funções puras, sem Prisma; a existência de fornecedor/proposta é conferida em server.ts.
// Valores monetários trafegam como TEXTO decimal (vírgula aceita e trocada por ponto) para não perder
// casas no float; o servidor converte para Prisma.Decimal ao gravar.
export class TrainingValidationError extends Error {}

/** Entrada validada do cadastro manual. Preços em texto decimal; quantity = quantidade base do item. */
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

// Texto obrigatório (string não vazia após trim).
function requiredText(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new TrainingValidationError(`${label} é obrigatório.`);
  return value.trim();
}

// Valor monetário obrigatório ≥ 0, recebido como texto ou número; devolve texto decimal com ponto.
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

/** Edição parcial: campo ausente = não alterar. supplierId/proposalId não são editáveis (ver server.ts). */
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

// Texto opcional: ausente → undefined (não altera); null → null (limpa); string → aparada.
function optionalText(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new TrainingValidationError(`Campo "${key}" inválido.`);
  return value.trim();
}

// Valor monetário opcional: ausente → undefined; presente → mesmas regras de requiredMoney.
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

/**
 * Valida o corpo do PATCH. Descrição, modalidade e forma de atendimento não podem ser esvaziadas; tipo e
 * duração podem ser limpos (null). Lança TrainingValidationError na primeira falha.
 */
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
