/** Entrada já validada e normalizada, pronta para gravar em AdministrativeEntity. */
// Validação e normalização do cadastro geral de entidades administrativas (favorecidos/fornecedores das
// obrigações e fornecedores de Treinamentos). Funções puras, sem Prisma: usadas pelas rotas
// /api/administrative-entities (POST/PATCH) e, para formatar/validar CNPJ, por telas e pelo CompanyPicker.
// Regras: CNPJ é opcional (vazio → null); quando informado, é gravado só com dígitos e validado pelos
// dígitos verificadores. Erros de entrada saem como AdministrativeEntityValidationError (mensagem exibível).
export type AdministrativeEntityInput = {
  cnpj: string | null;
  legalName: string;
  tradeName: string;
  activityArea: string;
  appliesProjeta: boolean;
  appliesBoinga: boolean;
  locality: string;
};

/** Erro de validação com mensagem de negócio; as rotas devolvem 400 com `error.message`. */
export class AdministrativeEntityValidationError extends Error {}

/**
 * Normaliza o CNPJ recebido do cliente: null/undefined/"" (ou só pontuação) → null; texto → 14 dígitos.
 * Lança AdministrativeEntityValidationError se não for string ou se os dígitos verificadores não baterem.
 */
export function normalizeCnpj(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new AdministrativeEntityValidationError("CNPJ inválido.");
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (!isValidCnpj(digits)) throw new AdministrativeEntityValidationError("Informe um CNPJ válido.");
  return digits;
}

/**
 * Valida CNPJ pelo algoritmo módulo 11 (pesos 5..2,9..2 e 6..2,9..2). Aceita com ou sem máscara.
 * Rejeita tamanho diferente de 14 e sequências repetidas (ex.: 00000000000000), que passariam no cálculo.
 */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (length: number) => {
    let weight = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight--;
      if (weight === 1) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

/** Formata 14 dígitos como 00.000.000/0000-00; null/vazio → "N/A" (texto exibido nas tabelas). */
export function formatCnpj(value: string | null): string {
  if (!value) return "N/A";
  return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

// Campo de texto obrigatório: precisa ser string não vazia após trim; devolve o valor aparado.
function requiredText(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AdministrativeEntityValidationError(`${label} é obrigatório.`);
  }
  return value.trim();
}

// SIM/NÃO obrigatório: o formulário envia boolean real; ausente ou outro tipo é erro (não assume default).
function requiredBoolean(body: Record<string, unknown>, key: string, label: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") {
    throw new AdministrativeEntityValidationError(`Selecione SIM ou NÃO para ${label}.`);
  }
  return value;
}

/**
 * Valida o corpo JSON de criação/edição. Todos os campos são obrigatórios, exceto o CNPJ.
 * Lança AdministrativeEntityValidationError na primeira falha encontrada.
 */
export function parseAdministrativeEntityInput(body: unknown): AdministrativeEntityInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdministrativeEntityValidationError("Corpo da requisição inválido.");
  }
  const input = body as Record<string, unknown>;
  return {
    cnpj: normalizeCnpj(input.cnpj),
    legalName: requiredText(input, "legalName", "Razão social"),
    tradeName: requiredText(input, "tradeName", "Nome fantasia"),
    activityArea: requiredText(input, "activityArea", "Área de atuação"),
    appliesProjeta: requiredBoolean(input, "appliesProjeta", "Projeta"),
    appliesBoinga: requiredBoolean(input, "appliesBoinga", "Boinga"),
    locality: requiredText(input, "locality", "Localidade"),
  };
}
