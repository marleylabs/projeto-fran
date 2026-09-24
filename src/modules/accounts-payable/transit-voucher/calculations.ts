// Funções puras (sem Prisma/server-only): a MESMA fórmula roda no backend (fonte da
// verdade) e no frontend (apenas prévia). Valores monetários em centavos inteiros.
//
// O calendário de competência (dias úteis/feriados) é compartilhado com outros módulos
// (Café da Manhã, futuros) em @/modules/shared/calendar — reexportado aqui para não quebrar
// os imports existentes deste módulo.
export { isoDate, daysInMonth, buildCompetenceCalendar, summarizeCompetenceDays, calculateWorkingDays } from "@/modules/shared/calendar";
export type { CalendarDayKind, CalendarDay } from "@/modules/shared/calendar";

export class TransitVoucherCalculationError extends Error {}

export const DEFAULT_FARE_UNIT_PRICE = "4.20";

const pad = (value: number) => String(value).padStart(2, "0");

const assertInteger = (value: number, label: string) => {
  if (!Number.isInteger(value)) throw new TransitVoucherCalculationError(`${label} deve ser um número inteiro.`);
};

// (dias úteis + diferença do mês anterior) - descontos. Sem clamp: resultado negativo é erro do chamador.
export function calculatePassagesToReceive(workingDays: number, previousMonthDifference: number, discount: number) {
  assertInteger(workingDays, "Dias úteis");
  assertInteger(previousMonthDifference, "Diferença do mês anterior");
  assertInteger(discount, "Descontos");
  return workingDays + previousMonthDifference - discount;
}

export function assertPassagesToReceive(value: number, employeeName?: string) {
  if (value < 0) throw new TransitVoucherCalculationError(`${employeeName ? `${employeeName}: ` : ""}Passagens a receber não pode ser negativo (${value}). Corrija os descontos ou a diferença do mês anterior.`);
}

export function parseFareToCents(value: string | number): number {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new TransitVoucherCalculationError("Valor da passagem deve ser um valor monetário com até 2 casas decimais.");
  const cents = Math.round(Number(text) * 100);
  if (cents <= 0) throw new TransitVoucherCalculationError("Valor da passagem deve ser maior que zero.");
  return cents;
}

// (tarifa × passagens por dia) × passagens a receber, em centavos.
export function calculateTransitVoucherEmployeeTotal(fareCents: number, dailyPassageQuantity: number, passagesToReceive: number) {
  assertInteger(fareCents, "Tarifa");
  assertInteger(dailyPassageQuantity, "Passagem por dia");
  assertInteger(passagesToReceive, "Passagens a receber");
  if (dailyPassageQuantity < 1) throw new TransitVoucherCalculationError("Passagem por dia deve ser no mínimo 1.");
  assertPassagesToReceive(passagesToReceive);
  return fareCents * dailyPassageQuantity * passagesToReceive;
}

export const centsToDecimalString = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${pad(Math.abs(cents) % 100)}`;

export type TransitObservationKind = "VACATION" | "OTHER";
export function formatTransitObservation(type: TransitObservationKind | null | undefined, details: string | null | undefined) {
  const text = (details ?? "").trim();
  if (!type) return text;
  if (type === "VACATION") return text ? `Férias: ${text}` : "Férias";
  return text;
}
