// Validação e normalização do cadastro manual de colaborador (POST/PATCH /api/collaborators) e funções de
// normalização de texto reaproveitadas pela importação (import.ts) e pelas buscas. Sem Prisma.
//
// CPF: opcional no cadastro manual. Vazio → null (no formulário, limpar o campo é uma ação explícita);
// preenchido → 11 dígitos validados (dígitos verificadores) ou erro "CPF inválido.".
// Data de Admissão: mesma semântica (vazio → null); aceita dd/MM/yyyy ou yyyy-MM-dd; datas impossíveis
// são rejeitadas. Datas futuras NÃO são bloqueadas: não há regra de negócio que proíba cadastrar uma admissão já agendada.
export type CollaboratorInput = { officialName: string; jobTitle?: string; department: string; costCenter?: string; cpf?: string | null; admissionDate?: string | null; active?: boolean };

/** Trim e espaços internos colapsados em um só. Aceita qualquer valor (null/undefined → ""). */
export function normalizeCollaboratorText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/** Chave de comparação/busca: texto normalizado, sem acentos e em minúsculas (vira FoodEmployee.normalizedName). */
export function normalizeCollaboratorSearch(value: unknown) {
  return normalizeCollaboratorText(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

/**
 * Valida e monta os dados de gravação. Nome e departamento são obrigatórios (Error genérico); CPF e admissão
 * lançam CpfValidationError/DateOnlyValidationError, convertidos em 400 por collaboratorWriteError.
 * Departamento e centro de custo passam por normalizeOrganizationalValue (grafia padronizada).
 */
export function parseCollaboratorInput(value: CollaboratorInput) {
  const officialName = normalizeCollaboratorText(value.officialName);
  const department = normalizeOrganizationalValue(value.department);
  if (!officialName || !department) throw new Error("Nome e departamento são obrigatórios.");
  return { officialName, normalizedName: normalizeCollaboratorSearch(officialName), jobTitle: normalizeCollaboratorText(value.jobTitle), department, costCenter: normalizeOrganizationalValue(value.costCenter), cpf: parseOptionalCpf(value.cpf), admissionDate: toAdmissionDate(value.admissionDate), active: value.active ?? true };
}
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { parseOptionalCpf } from "@/lib/cpf";
import { dateOnlyToDb, parseOptionalDateOnly } from "@/lib/date-only";
// Converte a data (texto) para o Date gravado no banco (dia sem hora), ou null quando vazia.
const toAdmissionDate = (value: unknown) => { const iso = parseOptionalDateOnly(value, "Data de Admissão"); return iso ? dateOnlyToDb(iso) : null; };
