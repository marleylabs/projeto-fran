// CPF: opcional no cadastro manual. Vazio → null (no formulário, limpar o campo é uma ação explícita);
// preenchido → 11 dígitos validados (dígitos verificadores) ou erro "CPF inválido.".
export type CollaboratorInput = { officialName: string; jobTitle?: string; department: string; costCenter?: string; cpf?: string | null; active?: boolean };

export function normalizeCollaboratorText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeCollaboratorSearch(value: unknown) {
  return normalizeCollaboratorText(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

export function parseCollaboratorInput(value: CollaboratorInput) {
  const officialName = normalizeCollaboratorText(value.officialName);
  const department = normalizeOrganizationalValue(value.department);
  if (!officialName || !department) throw new Error("Nome e departamento são obrigatórios.");
  return { officialName, normalizedName: normalizeCollaboratorSearch(officialName), jobTitle: normalizeCollaboratorText(value.jobTitle), department, costCenter: normalizeOrganizationalValue(value.costCenter), cpf: parseOptionalCpf(value.cpf), active: value.active ?? true };
}
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { parseOptionalCpf } from "@/lib/cpf";
