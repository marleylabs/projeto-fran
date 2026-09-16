export type AdministrativeEntityInput = {
  cnpj: string | null;
  legalName: string;
  tradeName: string;
  activityArea: string;
  appliesProjeta: boolean;
  appliesBoinga: boolean;
  locality: string;
};

export class AdministrativeEntityValidationError extends Error {}

export function normalizeCnpj(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new AdministrativeEntityValidationError("CNPJ inválido.");
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (!isValidCnpj(digits)) throw new AdministrativeEntityValidationError("Informe um CNPJ válido.");
  return digits;
}

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

export function formatCnpj(value: string | null): string {
  if (!value) return "N/A";
  return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function requiredText(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AdministrativeEntityValidationError(`${label} é obrigatório.`);
  }
  return value.trim();
}

function requiredBoolean(body: Record<string, unknown>, key: string, label: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") {
    throw new AdministrativeEntityValidationError(`Selecione SIM ou NÃO para ${label}.`);
  }
  return value;
}

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
