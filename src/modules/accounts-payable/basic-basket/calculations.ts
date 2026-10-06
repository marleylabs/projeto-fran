// Cesta Básica — funções puras (sem Prisma/server-only): a MESMA regra roda no backend (fonte da
// verdade, sempre recalcula) e no frontend (só prévia). Valores monetários em centavos inteiros.
import { daysInMonth, isoDate } from "@/modules/shared/calendar";
import { getBrazilianNationalHolidays } from "@/modules/shared/holidays";

export class BasicBasketCalculationError extends Error {}

export const basicBasketDaysInMonth = (year: number, month: number) => daysInMonth(year, month);

// Pagamento: SEMPRE a 2ª quarta-feira da competência — sem mover por feriado (não existe essa regra).
export function getSecondWednesday(year: number, month: number) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstWednesday = 1 + ((3 - firstWeekday + 7) % 7);
  return isoDate(year, month, firstWednesday + 7);
}

// ---- Datas "só dia" (yyyy-MM-dd): aritmética por Date.UTC(ano, mês, dia) — sem fuso nem horário de verão.
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
export const addDays = (iso: string, days: number) => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
const dayNumber = (iso: string) => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d) / 86400000; };
// Quantidade INCLUSIVA de dias entre duas datas (start > end → 0).
export const countDaysInclusive = (start: string, end: string) => Math.max(0, dayNumber(end) - dayNumber(start) + 1);
export const previousCompetence = (year: number, month: number) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });

// ---- Base financeira: MÊS COMERCIAL de 30 dias, SEMPRE (fevereiro, meses de 31…). Os dias reais do mês
// continuam existindo só para calendário/UI (basicBasketDaysInMonth) e NUNCA entram na fórmula.
export const BASIC_BASKET_CALCULATION_DAYS = 30;
// Dia comercial da data: min(dia do mês, 30) — admissão no dia 31 conta como dia 30 (1 dia de direito, nunca 0).
export const commercialDay = (iso: string) => Math.min(parts(iso)[2], BASIC_BASKET_CALCULATION_DAYS);
// Dias comerciais de direito do dia da admissão até o fim do mês comercial (inclusive).
const commercialDaysFrom = (iso: string) => BASIC_BASKET_CALCULATION_DAYS - commercialDay(iso) + 1;

// ---- Contexto da competência (snapshot no Map: pagamento anterior e atual). Dois cálculos SEPARADOS:
//  A) CESTA DA COMPETÊNCIA — currentBasketDays de 30
//     admissão ≤ 1º dia do mês → 30 (mês completo) · admissão até o pagamento atual → 30 − dia comercial + 1
//     · admissão depois do pagamento → 0 (recebe Cesta + Retroativo no mês seguinte)
//  B) RETROATIVO DO MÊS ANTERIOR — retroactiveDays de 30
//     só quando pagamento anterior < admissão ≤ último dia do mês anterior → 30 − dia comercial + 1
// Os dois usam o VALOR MENSAL cheio como base; o valor pago da Cesta é o proporcional.
// Os limites de mês (start/end) são datas reais: servem só para decidir em qual mês caiu a admissão.

export type BasicBasketContext = {
  previousPaymentDate: string; paymentDate: string;
  competenceYear: number; competenceMonth: number; currentMonthStart: string; currentMonthEnd: string;
  referenceYear: number; referenceMonth: number; referenceMonthStart: string; referenceMonthEnd: string;
};
const monthBounds = (year: number, month: number) => ({ start: isoDate(year, month, 1), end: isoDate(year, month, daysInMonth(year, month)) });
// Competência = mês do pagamento atual; mês de referência = mês do pagamento anterior (por construção).
export function basicBasketContextFromPayments(previousPaymentDate: string, paymentDate: string): BasicBasketContext {
  const [competenceYear, competenceMonth] = parts(paymentDate), [referenceYear, referenceMonth] = parts(previousPaymentDate);
  const current = monthBounds(competenceYear, competenceMonth), reference = monthBounds(referenceYear, referenceMonth);
  return { previousPaymentDate, paymentDate, competenceYear, competenceMonth, currentMonthStart: current.start, currentMonthEnd: current.end, referenceYear, referenceMonth, referenceMonthStart: reference.start, referenceMonthEnd: reference.end };
}
export function buildBasicBasketContext(year: number, month: number) {
  const previous = previousCompetence(year, month);
  return basicBasketContextFromPayments(getSecondWednesday(previous.year, previous.month), getSecondWednesday(year, month));
}

// A) Cesta da competência. MISSING_ADMISSION é bloqueante: sem a data não há cálculo financeiro seguro.
export type CurrentBasketStatus = "FULL_MONTH" | "PRORATED" | "AFTER_PAYMENT" | "MISSING_ADMISSION";
export function calculateCurrentBasketDays(input: { context: BasicBasketContext; admissionDate: string | null | undefined }) {
  const { context, admissionDate } = input;
  if (!admissionDate) return { status: "MISSING_ADMISSION" as CurrentBasketStatus, currentBasketDays: 0 };
  if (admissionDate > context.paymentDate) return { status: "AFTER_PAYMENT" as CurrentBasketStatus, currentBasketDays: 0 };
  if (admissionDate <= context.currentMonthStart) return { status: "FULL_MONTH" as CurrentBasketStatus, currentBasketDays: BASIC_BASKET_CALCULATION_DAYS };
  return { status: "PRORATED" as CurrentBasketStatus, currentBasketDays: commercialDaysFrom(admissionDate) };
}

// B) Retroativo do mês anterior. PRORATED: tem Retroativo · NONE: admitido até o pagamento anterior ·
// CURRENT_OR_LATER: admitido na competência atual ou depois · MISSING_ADMISSION: sem Data de Admissão.
export type RetroactiveStatus = "PRORATED" | "NONE" | "CURRENT_OR_LATER" | "MISSING_ADMISSION";
export function calculateRetroactiveDays(input: { context: BasicBasketContext; admissionDate: string | null | undefined }) {
  const { context, admissionDate } = input;
  const none = (status: RetroactiveStatus) => ({ status, retroactiveDays: 0, retroactiveStart: null as string | null, retroactiveEnd: null as string | null });
  if (!admissionDate) return none("MISSING_ADMISSION");
  if (admissionDate <= context.previousPaymentDate) return none("NONE");
  if (admissionDate > context.referenceMonthEnd) return none("CURRENT_OR_LATER");
  return { status: "PRORATED" as RetroactiveStatus, retroactiveDays: commercialDaysFrom(admissionDate), retroactiveStart: admissionDate, retroactiveEnd: context.referenceMonthEnd };
}
// base × dias ÷ total, em centavos inteiros com arredondamento comercial (metade para cima,
// mesmo comportamento padrão do Prisma.Decimal/ROUND_HALF_UP). Sem float no valor autoritativo.
export function prorateCents(baseCents: number, days: number, totalDays: number) {
  if (!Number.isInteger(baseCents) || !Number.isInteger(days) || !Number.isInteger(totalDays) || baseCents < 0 || days < 0 || totalDays <= 0 || days > totalDays) throw new BasicBasketCalculationError("Proporção da Cesta Básica inválida.");
  return Math.floor((2 * baseCents * days + totalDays) / (2 * totalDays));
}
// Dinheiro digitado: "400", "400,5", "400,50", "1.234,56" ou "400.50" → centavos. Vazio → 0.
// Negativo ou com mais de 2 casas → erro. (Mesma ideia de parseUnitPriceToCents do Café, mas aceita 0.)
export function parseMoneyToCents(value: unknown, label: string): number {
  if (typeof value === "number") { if (!Number.isFinite(value) || value < 0) throw new BasicBasketCalculationError(`${label} inválido.`); return Math.round(value * 100); }
  let text = String(value ?? "").trim().replace(/^R\$\s*/i, "");
  if (!text) return 0;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) text = text.replace(/\./g, "");
  text = text.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BasicBasketCalculationError(`${label} inválido.`);
  const [integer, fraction = ""] = text.split(".");
  return Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
}

export type BasicBasketLineInput = { driverBonusCents: number; agreementCents: number; monthlyBasketCents: number; currentBasketDays: number; retroactiveDays: number };
// Cesta paga = mensal × dias de direito ÷ base (30) · Retroativo = mensal × dias retroativos ÷ base (30) ·
// Total = Bonificação + Acordo + Cesta paga + Retroativo (Bonificação/Acordo sem proporção).
export function calculateBasicBasketLine(input: BasicBasketLineInput) {
  for (const [value, label] of [[input.driverBonusCents, "Bonificação Condutor"], [input.agreementCents, "Acordo"], [input.monthlyBasketCents, "Cesta Básica"]] as const) {
    if (!Number.isInteger(value) || value < 0) throw new BasicBasketCalculationError(`${label} não pode ser negativo.`);
  }
  const payableBasketCents = input.currentBasketDays > 0 ? prorateCents(input.monthlyBasketCents, input.currentBasketDays, BASIC_BASKET_CALCULATION_DAYS) : 0;
  const retroactiveCents = input.retroactiveDays > 0 ? prorateCents(input.monthlyBasketCents, input.retroactiveDays, BASIC_BASKET_CALCULATION_DAYS) : 0;
  return { payableBasketCents, retroactiveCents, totalCents: input.driverBonusCents + input.agreementCents + payableBasketCents + retroactiveCents };
}

export const centsToDecimalString = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

// Calendário só VISUAL: nacionais (helper compartilhado) + manuais do Vale Transporte e do Café da Manhã,
// uma entrada por data (mesma data em várias fontes aparece uma vez, com a lista de fontes).
export type BasicBasketHolidaySource = "NATIONAL" | "TRANSIT_VOUCHER" | "BREAKFAST";
export type BasicBasketHoliday = { date: string; name: string; sources: BasicBasketHolidaySource[]; names: string[] };
export function mergeBasicBasketHolidays(year: number, month: number, transit: { date: string; name: string }[], breakfast: { date: string; name: string }[]): BasicBasketHoliday[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const byDate = new Map<string, BasicBasketHoliday>();
  const add = (date: string, name: string, source: BasicBasketHolidaySource) => {
    if (!date.startsWith(prefix)) return;
    const current = byDate.get(date) ?? { date, name, sources: [], names: [] };
    if (!current.sources.includes(source)) current.sources.push(source);
    if (!current.names.includes(name)) current.names.push(name);
    byDate.set(date, current);
  };
  for (const holiday of getBrazilianNationalHolidays(year)) add(holiday.date, holiday.name, "NATIONAL");
  for (const holiday of transit) add(holiday.date, holiday.name, "TRANSIT_VOUCHER");
  for (const holiday of breakfast) add(holiday.date, holiday.name, "BREAKFAST");
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

