// Normalização de números e datas no padrão brasileiro (1.234,56 / dd/mm/yyyy).

/**
 * Converte "1.234,56", "8.268,00" ou "0,00" para número decimal.
 * Retorna null quando a string não corresponde a um número válido, para que o
 * chamador possa marcar o campo como baixa confiança em vez de assumir zero.
 */
export function parseBRNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  // Formato BR: ponto = milhar, vírgula = decimal.
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Formata um número para o padrão BR (uso em exportações/exibição). */
export function formatBRNumber(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formatos esperados no texto dos PDFs de folha (CPF já pontuado, data dd/mm/aaaa). Só checam formato, não validade — para CPF válido use src/lib/cpf.ts.
const CPF_REGEX = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const DATE_REGEX = /\d{2}\/\d{2}\/\d{4}/;

/** `true` se o texto contém um CPF no formato 000.000.000-00 (sem validar dígitos verificadores). */
export function isValidCpfFormat(value: string): boolean {
  return CPF_REGEX.test(value);
}

/** `true` se o texto contém uma data dd/mm/aaaa (sem validar dia/mês). */
export function isValidDateFormat(value: string): boolean {
  return DATE_REGEX.test(value);
}

/** Primeiro CPF pontuado encontrado no texto, ou null. */
export function extractCpf(text: string): string | null {
  const m = text.match(CPF_REGEX);
  return m ? m[0] : null;
}

/** Primeira data dd/mm/aaaa encontrada no texto, ou null. */
export function extractDate(text: string): string | null {
  const m = text.match(DATE_REGEX);
  return m ? m[0] : null;
}
