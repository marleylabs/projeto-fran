// Funções puras (sem Prisma/server-only): a MESMA fórmula roda no backend (fonte da
// verdade) e no frontend (apenas prévia). Valores monetários em centavos inteiros.

export class TransitVoucherCalculationError extends Error {}

export const DEFAULT_FARE_UNIT_PRICE = "4.20";

const pad = (value: number) => String(value).padStart(2, "0");
export const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const weekdayOf = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

export type CalendarDayKind = "WORKING" | "WEEKEND" | "HOLIDAY";
export type CalendarDay = { date: string; day: number; weekday: number; weekend: boolean; holiday: boolean; kind: CalendarDayKind; countsAsWorking: boolean };

// Feriado sempre aparece como feriado; só reduz dia útil quando cai de segunda a sexta.
export function buildCompetenceCalendar(year: number, month: number, holidayDates: string[]): CalendarDay[] {
  const holidays = new Set(holidayDates);
  return Array.from({ length: daysInMonth(year, month) }, (_, index) => {
    const day = index + 1;
    const weekday = weekdayOf(year, month, day);
    const weekend = weekday === 0 || weekday === 6;
    const date = isoDate(year, month, day);
    const holiday = holidays.has(date);
    return { date, day, weekday, weekend, holiday, kind: holiday ? "HOLIDAY" : weekend ? "WEEKEND" : "WORKING", countsAsWorking: !weekend && !holiday };
  });
}

export function summarizeCompetenceDays(year: number, month: number, holidayDates: string[]) {
  const calendar = buildCompetenceCalendar(year, month, holidayDates);
  const weekdays = calendar.filter((day) => !day.weekend).length;
  const holidaysInMonth = calendar.filter((day) => day.holiday).length;
  const holidaysOnWeekdays = calendar.filter((day) => day.holiday && !day.weekend).length;
  return { weekdays, holidaysInMonth, holidaysOnWeekdays, workingDays: weekdays - holidaysOnWeekdays };
}

export const calculateWorkingDays = (year: number, month: number, holidayDates: string[]) => summarizeCompetenceDays(year, month, holidayDates).workingDays;

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
