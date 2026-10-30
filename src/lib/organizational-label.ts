// Normalização de rótulos organizacionais (departamento, centro de custo, cargo...) usada em cadastros,
// importações e filtros.

/** Forma canônica para gravar/exibir: NFC, sem espaços extras, MAIÚSCULAS (pt-BR). */
export function normalizeOrganizationalValue(value: unknown) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

/** Chave só para comparar/deduplicar: canônica sem acentos e em minúsculas ("Logística" == "LOGISTICA"). */
export function organizationalComparisonKey(value: unknown) {
  return normalizeOrganizationalValue(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
