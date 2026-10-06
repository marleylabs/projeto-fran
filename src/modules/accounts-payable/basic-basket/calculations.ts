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
//  C) ASSIDUIDADE (elegibilidade da Cesta da competência) — absenceReferenceMonth = MÊS CALENDÁRIO ANTERIOR
//     COMPLETO (01 ao último dia; o pagamento anterior NÃO limita o início). Conceito próprio, separado do Retroativo,
//     mesmo apontando hoje para o mesmo mês.
// Os limites de mês (start/end) são datas reais: servem só para decidir em qual mês caiu cada data.
export type BasicBasketContext = {
  previousPaymentDate: string; paymentDate: string;
  competenceYear: number; competenceMonth: number; currentMonthStart: string; currentMonthEnd: string;
  referenceYear: number; referenceMonth: number; referenceMonthStart: string; referenceMonthEnd: string;
  absenceReferenceYear: number; absenceReferenceMonth: number; absenceReferenceMonthStart: string; absenceReferenceMonthEnd: string;
};
const monthBounds = (year: number, month: number) => ({ start: isoDate(year, month, 1), end: isoDate(year, month, daysInMonth(year, month)) });
// Competência = mês do pagamento atual; mês de referência = mês do pagamento anterior (por construção).
export function basicBasketContextFromPayments(previousPaymentDate: string, paymentDate: string): BasicBasketContext {
  const [competenceYear, competenceMonth] = parts(paymentDate), [referenceYear, referenceMonth] = parts(previousPaymentDate);
  const current = monthBounds(competenceYear, competenceMonth), reference = monthBounds(referenceYear, referenceMonth);
  const absence = previousCompetence(competenceYear, competenceMonth), absenceBounds = monthBounds(absence.year, absence.month);
  return { previousPaymentDate, paymentDate, competenceYear, competenceMonth, currentMonthStart: current.start, currentMonthEnd: current.end, referenceYear, referenceMonth, referenceMonthStart: reference.start, referenceMonthEnd: reference.end, absenceReferenceYear: absence.year, absenceReferenceMonth: absence.month, absenceReferenceMonthStart: absenceBounds.start, absenceReferenceMonthEnd: absenceBounds.end };
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

// ---- Espelho de Ponto. Regras SEPARADAS sobre as mesmas datas importadas:
//  • Cesta da competência — Falta Injustificada no MÊS DE APURAÇÃO (mês calendário anterior completo) corta a Cesta
//    INTEGRALMENTE (não é desconto por dia; vence admissão proporcional e Férias). Falta no próprio mês da competência
//    não corta esta Cesta (pertence à apuração da próxima competência).
//  • Retroativo — regra própria, mantida: Falta Injustificada dentro do mês de referência do Retroativo zera o Retroativo.
//  • Férias: as do mês da competência reduzem a Cesta; as do mês anterior, só o Retroativo. Reduzem os dias de direito
//    por BLOCOS CONTÍNUOS convertidos para o mês comercial (ver buildBasicBasketVacationBlocks), só a partir da
//    admissão e só na interseção com os dias de direito. Nunca passa do direito.
// absenceDates: Faltas Injustificadas válidas no mês anterior e no mês da competência (as demais são descartadas).
export type BasicBasketOccurrences = { absenceDates: string[]; currentVacationDates: string[]; referenceVacationDates: string[] };
export type BasicBasketAdjustments = { currentVacationDays: number; currentUnjustifiedAbsence: boolean; retroactiveVacationDays: number; retroactiveUnjustifiedAbsence: boolean };
export const NO_BASIC_BASKET_ADJUSTMENTS: BasicBasketAdjustments = { currentVacationDays: 0, currentUnjustifiedAbsence: false, retroactiveVacationDays: 0, retroactiveUnjustifiedAbsence: false };
export const EMPTY_BASIC_BASKET_OCCURRENCES: BasicBasketOccurrences = { absenceDates: [], currentVacationDates: [], referenceVacationDates: [] };

// Férias por BLOCOS CONTÍNUOS dentro de UM mês (nunca atravessam meses): datas reais deduplicadas e ordenadas; dias
// de calendário consecutivos formam um bloco. Cada bloco vira dias FINANCEIROS (1..30, Set — sem dupla contagem):
// dia comercial = min(dia, 30), então 30 e 31 viram {30}. Em mês com menos de 30 dias, um bloco de 2+ dias que
// alcança o último dia real se estende até o dia comercial 30 (Fevereiro inteiro = 30); um dia ISOLADO no último dia
// real não é estendido (sem prova de continuidade) e gera aviso. Datas antes de `fromDate` (admissão) são ignoradas.
export type BasicBasketVacationBlock = { start: string; end: string; financialDays: number[]; extendedToMonthEnd: boolean; isolatedLastDay: boolean };
export function buildBasicBasketVacationBlocks(dates: readonly string[], monthStart: string, monthEnd: string, fromDate: string = monthStart): BasicBasketVacationBlock[] {
  const lowerBound = fromDate > monthStart ? fromDate : monthStart;
  const sorted = [...new Set(dates)].filter((date) => date >= lowerBound && date <= monthEnd).sort();
  const lastRealDay = parts(monthEnd)[2], shortMonth = lastRealDay < BASIC_BASKET_CALCULATION_DAYS;
  const blocks: BasicBasketVacationBlock[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index; while (end + 1 < sorted.length && addDays(sorted[end], 1) === sorted[end + 1]) end += 1;
    const start = sorted[index], last = sorted[end];
    const reachesEnd = last === monthEnd, extended = shortMonth && reachesEnd && start < last;
    const fromDay = commercialDay(start), toDay = extended ? BASIC_BASKET_CALCULATION_DAYS : commercialDay(last);
    blocks.push({ start, end: last, financialDays: Array.from({ length: toDay - fromDay + 1 }, (_, offset) => fromDay + offset), extendedToMonthEnd: extended, isolatedLastDay: shortMonth && reachesEnd && start === last });
    index = end;
  }
  return blocks;
}
// Férias aplicáveis = dias financeiros de Férias ∩ dias financeiros de direito (startDay..30); nunca passa do direito.
function applicableVacationDays(dates: readonly string[], periodStart: string, monthStart: string, monthEnd: string, entitlementDays: number) {
  if (entitlementDays <= 0) return 0;
  const startDay = commercialDay(periodStart > monthStart ? periodStart : monthStart);
  const vacation = new Set(buildBasicBasketVacationBlocks(dates, monthStart, monthEnd, periodStart).flatMap((block) => block.financialDays));
  return Math.min([...vacation].filter((day) => day >= startDay).length, entitlementDays);
}
// Datas de ocorrência aplicáveis ao colaborador: só a partir da admissão (inclusive). Reutilizável por Falta e Férias.
export const applicableOccurrenceDates = (dates: readonly string[], admissionDate: string) => dates.filter((date) => date >= admissionDate);

export function resolveBasicBasketAdjustments(input: { context: BasicBasketContext; admissionDate: string | null | undefined; occurrences: BasicBasketOccurrences | null | undefined }): BasicBasketAdjustments {
  const { context, admissionDate } = input; const occurrences = input.occurrences ?? EMPTY_BASIC_BASKET_OCCURRENCES;
  if (!admissionDate) return NO_BASIC_BASKET_ADJUSTMENTS;
  const current = calculateCurrentBasketDays({ context, admissionDate }), retro = calculateRetroactiveDays({ context, admissionDate });
  // Regra fundamental: ocorrência ANTERIOR à admissão nunca afeta o benefício (data inclusiva: no dia da admissão já vale).
  // Férias já respeitam isso pelo início do período de direito; aqui o mesmo corte vale para as Faltas.
  const absenceDates = applicableOccurrenceDates(occurrences.absenceDates, admissionDate);
  const inMonth = (dates: readonly string[], start: string, end: string) => dates.some((date) => date >= start && date <= end);
  const currentStart = admissionDate > context.currentMonthStart ? admissionDate : context.currentMonthStart;
  return {
    currentVacationDays: applicableVacationDays(occurrences.currentVacationDates, currentStart, context.currentMonthStart, context.currentMonthEnd, current.currentBasketDays),
    // currentUnjustifiedAbsence = Falta no MÊS DE APURAÇÃO da Cesta (não "falta dentro da competência").
    currentUnjustifiedAbsence: current.currentBasketDays > 0 && inMonth(absenceDates, context.absenceReferenceMonthStart, context.absenceReferenceMonthEnd),
    retroactiveVacationDays: applicableVacationDays(occurrences.referenceVacationDates, admissionDate, context.referenceMonthStart, context.referenceMonthEnd, retro.retroactiveDays),
    retroactiveUnjustifiedAbsence: retro.retroactiveDays > 0 && inMonth(absenceDates, context.referenceMonthStart, context.referenceMonthEnd),
  };
}

export type BasicBasketLineInput = { driverBonusCents: number; agreementCents: number; monthlyBasketCents: number; currentBasketDays: number; retroactiveDays: number; adjustments?: BasicBasketAdjustments };
// Dias finais = direito − Férias aplicáveis (mínimo 0), ou 0 com Falta Injustificada.
// Cesta paga = mensal × currentPayableDays ÷ base (30) · Retroativo = mensal × retroactivePayableDays ÷ base (30) ·
// Total = Bonificação + Acordo + Cesta paga + Retroativo (Bonificação/Acordo sem proporção).
export function calculateBasicBasketLine(input: BasicBasketLineInput) {
  for (const [value, label] of [[input.driverBonusCents, "Bonificação Condutor"], [input.agreementCents, "Acordo"], [input.monthlyBasketCents, "Cesta Básica"]] as const) {
    if (!Number.isInteger(value) || value < 0) throw new BasicBasketCalculationError(`${label} não pode ser negativo.`);
  }
  const adjustments = input.adjustments ?? NO_BASIC_BASKET_ADJUSTMENTS;
  for (const days of [adjustments.currentVacationDays, adjustments.retroactiveVacationDays]) if (!Number.isInteger(days) || days < 0) throw new BasicBasketCalculationError("Dias de Férias inválidos.");
  const currentPayableDays = adjustments.currentUnjustifiedAbsence ? 0 : Math.max(input.currentBasketDays - adjustments.currentVacationDays, 0);
  const retroactivePayableDays = adjustments.retroactiveUnjustifiedAbsence ? 0 : Math.max(input.retroactiveDays - adjustments.retroactiveVacationDays, 0);
  const payableBasketCents = currentPayableDays > 0 ? prorateCents(input.monthlyBasketCents, currentPayableDays, BASIC_BASKET_CALCULATION_DAYS) : 0;
  const retroactiveCents = retroactivePayableDays > 0 ? prorateCents(input.monthlyBasketCents, retroactivePayableDays, BASIC_BASKET_CALCULATION_DAYS) : 0;
  return { currentPayableDays, retroactivePayableDays, payableBasketCents, retroactiveCents, totalCents: input.driverBonusCents + input.agreementCents + payableBasketCents + retroactiveCents };
}

// Datas → texto curto para a tela ("01/10 a 15/10, 20/10"), agrupando dias consecutivos.
export function summarizeDateRanges(dates: readonly string[]) {
  const sorted = [...new Set(dates)].sort(); const ranges: string[] = [];
  const label = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index; while (end + 1 < sorted.length && addDays(sorted[end], 1) === sorted[end + 1]) end += 1;
    ranges.push(end > index ? `${label(sorted[index])} a ${label(sorted[end])}` : label(sorted[index])); index = end;
  }
  return ranges.join(", ");
}export const centsToDecimalString = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

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

