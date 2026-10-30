// Validação dos corpos JSON das rotas de Despesas de Treinamento (fronteira de confiança: o body vem do cliente).
// Só formato; regras que dependem do banco (treinamento ativo, colaborador ativo, estado financeiro) ficam em server.ts.

/** Erro de negócio/validação; as rotas devolvem a mensagem com HTTP 400. */
export class TrainingExpenseValidationError extends Error {}

/** POST de criação (rascunho). Sem valores: o servidor calcula a partir do snapshot do catálogo. */
export type CreateTrainingExpenseInput = {
  year: number;
  month: number;
  trainingId: string;
  trainingDate: string;
  employeeIds: string[];
};

/**
 * PATCH (parcial): só os campos presentes no body são alterados. finalAmount é texto decimal com ponto e, se diferente
 * do calculado, exige adjustmentReason (checado no servidor). adjustmentReason null/vazio limpa a justificativa.
 */
export type UpdateTrainingExpenseInput = {
  trainingDate?: string;
  employeeIds?: string[];
  finalAmount?: string;
  adjustmentReason?: string | null;
};

/** POST de cancelamento: motivo obrigatório (vai para cancellationReason). */
export type CancelTrainingExpenseInput = { reason: string };

function requiredString(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new TrainingExpenseValidationError(`${label} é obrigatório.`);
  return value.trim();
}

function requiredEmployeeIds(body: Record<string, unknown>): string[] {
  const value = body.employeeIds;
  if (!Array.isArray(value) || !value.length) throw new TrainingExpenseValidationError("Selecione ao menos um participante.");
  const ids = value.map((entry) => String(entry).trim()).filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new TrainingExpenseValidationError("Há colaboradores duplicados na seleção de participantes.");
  return unique;
}

/** Valida competência (ano 2000–2200, mês 1–12), data "aaaa-mm-dd", treinamento e participantes únicos. */
export function parseCreateTrainingExpenseInput(body: unknown): CreateTrainingExpenseInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TrainingExpenseValidationError("Corpo da requisição inválido.");
  const input = body as Record<string, unknown>;
  const year = input.year;
  const month = input.month;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2200) throw new TrainingExpenseValidationError("Competência (ano) inválida.");
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) throw new TrainingExpenseValidationError("Competência (mês) inválida.");
  const trainingDate = requiredString(input, "trainingDate", "Data do treinamento");
  if (Number.isNaN(new Date(`${trainingDate}T00:00:00.000Z`).getTime())) throw new TrainingExpenseValidationError("Data do treinamento inválida.");
  return {
    year,
    month,
    trainingId: requiredString(input, "trainingId", "Treinamento"),
    trainingDate,
    employeeIds: requiredEmployeeIds(input),
  };
}

/**
 * Valida o PATCH. finalAmount aceita vírgula ou ponto e precisa ser > 0; a quantidade de casas não é limitada aqui
 * (mais de 2 casas acaba recusada pela conferência do rateio em distributeAmountAcrossParticipants).
 */
export function parseUpdateTrainingExpenseInput(body: unknown): UpdateTrainingExpenseInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TrainingExpenseValidationError("Corpo da requisição inválido.");
  const input = body as Record<string, unknown>;
  const result: UpdateTrainingExpenseInput = {};

  if ("trainingDate" in input) {
    const trainingDate = requiredString(input, "trainingDate", "Data do treinamento");
    if (Number.isNaN(new Date(`${trainingDate}T00:00:00.000Z`).getTime())) throw new TrainingExpenseValidationError("Data do treinamento inválida.");
    result.trainingDate = trainingDate;
  }
  if ("employeeIds" in input) result.employeeIds = requiredEmployeeIds(input);
  if ("finalAmount" in input) {
    const value = input.finalAmount;
    if (typeof value !== "string" && typeof value !== "number") throw new TrainingExpenseValidationError("Valor final inválido.");
    const normalized = String(value).replace(",", ".").trim();
    if (!normalized || Number.isNaN(Number(normalized)) || Number(normalized) <= 0) throw new TrainingExpenseValidationError("Valor final deve ser um valor monetário maior que zero.");
    result.finalAmount = normalized;
  }
  if ("adjustmentReason" in input) {
    const value = input.adjustmentReason;
    if (value !== null && typeof value !== "string") throw new TrainingExpenseValidationError("Justificativa inválida.");
    result.adjustmentReason = typeof value === "string" ? value.trim() || null : null;
  }
  return result;
}

/** Valida o body do cancelamento (motivo obrigatório). */
export function parseCancelTrainingExpenseInput(body: unknown): CancelTrainingExpenseInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TrainingExpenseValidationError("Corpo da requisição inválido.");
  const input = body as Record<string, unknown>;
  return { reason: requiredString(input, "reason", "Motivo do cancelamento") };
}
