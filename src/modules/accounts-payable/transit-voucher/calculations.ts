// Funções puras (sem Prisma/server-only): a MESMA fórmula roda no backend (fonte da
// verdade) e no frontend (apenas prévia). Valores monetários em centavos inteiros.
//
// O calendário de competência (dias úteis/feriados) é compartilhado com outros módulos
// (Café da Manhã, futuros) em @/modules/shared/calendar — reexportado aqui para não quebrar
// os imports existentes deste módulo.
export { isoDate, daysInMonth, buildCompetenceCalendar, summarizeCompetenceDays, calculateWorkingDays } from "@/modules/shared/calendar";
export type { CalendarDayKind, CalendarDay } from "@/modules/shared/calendar";

/**
 * Erro de regra de cálculo (entrada inválida ou resultado impossível). As funções de servidor
 * (manual-server.ts) convertem em TransitVoucherValidationError, que as rotas devolvem como HTTP 400.
 */
export class TransitVoucherCalculationError extends Error {}

/** Tarifa padrão (texto decimal com ponto) usada enquanto a competência não tem tarifa salva. */
export const DEFAULT_FARE_UNIT_PRICE = "4.20";

const pad = (value: number) => String(value).padStart(2, "0");

const assertInteger = (value: number, label: string) => {
  if (!Number.isInteger(value)) throw new TransitVoucherCalculationError(`${label} deve ser um número inteiro.`);
};

// (dias úteis + diferença do mês anterior) - descontos. Sem clamp: resultado negativo é erro do chamador.
/** Todas as entradas são quantidades de passagens (inteiros); lança TransitVoucherCalculationError se não forem. */
export function calculatePassagesToReceive(workingDays: number, previousMonthDifference: number, discount: number) {
  assertInteger(workingDays, "Dias úteis");
  assertInteger(previousMonthDifference, "Diferença do mês anterior");
  assertInteger(discount, "Descontos");
  return workingDays + previousMonthDifference - discount;
}

/** Bloqueia passagens a receber negativas; a mensagem (com o nome do colaborador, se houver) vai direto para o usuário. */
export function assertPassagesToReceive(value: number, employeeName?: string) {
  if (value < 0) throw new TransitVoucherCalculationError(`${employeeName ? `${employeeName}: ` : ""}Passagens a receber não pode ser negativo (${value}). Corrija os descontos ou a diferença do mês anterior.`);
}

/**
 * Converte a tarifa ("4,20", "4.20" ou número) em centavos inteiros — toda a conta de VT é feita em centavos.
 * Aceita no máximo 2 casas decimais e exige valor > 0; caso contrário lança TransitVoucherCalculationError.
 */
export function parseFareToCents(value: string | number): number {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new TransitVoucherCalculationError("Valor da passagem deve ser um valor monetário com até 2 casas decimais.");
  // O regex já limitou a 2 casas; Math.round absorve o erro de float da multiplicação (ex.: 4.2 * 100 = 420.00000000000006).
  const cents = Math.round(Number(text) * 100);
  if (cents <= 0) throw new TransitVoucherCalculationError("Valor da passagem deve ser maior que zero.");
  return cents;
}

// (tarifa × passagens por dia) × passagens a receber, em centavos.
/** Exige inteiros, passagem por dia >= 1 e passagens a receber >= 0. Usada na prévia da página e, como fonte da verdade, no servidor. */
export function calculateTransitVoucherEmployeeTotal(fareCents: number, dailyPassageQuantity: number, passagesToReceive: number) {
  assertInteger(fareCents, "Tarifa");
  assertInteger(dailyPassageQuantity, "Passagem por dia");
  assertInteger(passagesToReceive, "Passagens a receber");
  if (dailyPassageQuantity < 1) throw new TransitVoucherCalculationError("Passagem por dia deve ser no mínimo 1.");
  assertPassagesToReceive(passagesToReceive);
  return fareCents * dailyPassageQuantity * passagesToReceive;
}

/** Centavos inteiros → texto decimal "123.45" (formato aceito por Prisma.Decimal), sem passar por float. */
export const centsToDecimalString =(cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${pad(Math.abs(cents) % 100)}`;

/** Tipo da observação do lançamento (Férias ou Outros); OTHER exige detalhe (validado em manual-server.ts). */
export type TransitObservationKind = "VACATION" | "OTHER";
/** Texto exibido da observação (tela e XLSX): "Férias: <detalhe>" para VACATION; só o detalhe nos demais casos. */
export function formatTransitObservation(type: TransitObservationKind | null | undefined, details: string | null | undefined) {
  const text = (details ?? "").trim();
  if (!type) return text;
  if (type === "VACATION") return text ? `Férias: ${text}` : "Férias";
  return text;
}
