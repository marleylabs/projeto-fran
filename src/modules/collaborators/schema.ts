export type CollaboratorInput = { officialName: string; jobTitle?: string; department: string; costCenter?: string; active?: boolean };

export function normalizeCollaboratorText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeCollaboratorSearch(value: unknown) {
  return normalizeCollaboratorText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function parseCollaboratorInput(value: CollaboratorInput) {
  const officialName = normalizeCollaboratorText(value.officialName);
  const department = normalizeOrganizationalValue(value.department);
  if (!officialName || !department) throw new Error("Nome e departamento são obrigatórios.");
  return { officialName, normalizedName: normalizeCollaboratorSearch(officialName), jobTitle: normalizeCollaboratorText(value.jobTitle), department, costCenter: normalizeOrganizationalValue(value.costCenter), active: value.active ?? true };
}
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
