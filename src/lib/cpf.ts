// CPF: helper único (frontend e backend) para normalizar, validar, formatar e mascarar.
// Persistência: apenas os 11 dígitos. Exibição: 000.000.000-00. Mensagens/logs: só a forma mascarada.

export class CpfValidationError extends Error {}

// Só dígitos. Número vindo de planilha (Excel descarta zeros à esquerda) volta a ter 11 dígitos.
export function normalizeCpf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value)).padStart(11, "0");
  return String(value ?? "").replace(/\D/g, "");
}

// Validação real: 11 dígitos, não repetidos (000…, 111…) e os dois dígitos verificadores (módulo 11).
export function isValidCpf(value: unknown): boolean {
  const digits = normalizeCpf(value);
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

// Entrada opcional: vazio → null; preenchido → 11 dígitos válidos ou erro "CPF inválido.".
export function parseOptionalCpf(value: unknown): string | null {
  const digits = normalizeCpf(value);
  if (!digits && !String(value ?? "").trim()) return null;
  if (!isValidCpf(digits)) throw new CpfValidationError("CPF inválido.");
  return digits;
}

export function formatCpf(value: unknown): string {
  const digits = normalizeCpf(value);
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : digits;
}

// Máscara de digitação progressiva (até 11 dígitos).
export function maskCpfInput(value: string): string {
  const digits = normalizeCpf(value).slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

// Para mensagens de conflito: nunca o CPF completo.
export function maskCpf(value: unknown): string {
  const digits = normalizeCpf(value);
  return digits.length === 11 ? `***.***.***-${digits.slice(9)}` : "***.***.***-**";
}
