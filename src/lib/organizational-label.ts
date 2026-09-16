export function normalizeOrganizationalValue(value: unknown) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export function organizationalComparisonKey(value: unknown) {
  return normalizeOrganizationalValue(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
