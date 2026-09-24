// Feriados NACIONAIS brasileiros derivados por código (sem registros no banco) + merge com
// feriados MANUAIS (estaduais, municipais, internos, exceções — vindos do banco de cada módulo).
// Fonte ÚNICA e compartilhada: qualquer módulo com competência mensal (Vale Transporte, Café da
// Manhã, futuros módulos) usa esta mesma regra de feriados nacionais e de dias úteis. Funções
// puras: a mesma regra serve backend (fonte da verdade) e frontend (que só recebe o resultado
// pronto do contexto).
//
// Base utilizada (feriados nacionais civis e o dia religioso nacional do calendário do Governo Federal):
//  - Lei 662/1949 (01/01, 01/05, 07/09, 15/11, 25/12), Lei 6.802/1980 (12/10), Lei 10.607/2002 (21/04, 02/11)
//  - Lei 14.759/2023 (20/11, Dia Nacional de Zumbi e da Consciência Negra) — feriado nacional a partir de 2024
//  - Sexta-feira da Paixão (Lei 9.093/1995, art. 2º, I): móvel, dois dias antes da Páscoa (calendário gregoriano)
// NÃO são automáticos (pontos facultativos, decididos por portaria a cada ano): Carnaval, Quarta-feira de
// Cinzas, Corpus Christi, vésperas de Natal/Ano Novo, Dia do Servidor Público. Quando a empresa não
// trabalhar nesses dias, o usuário cadastra manualmente. Decisão com impacto financeiro nos módulos
// que dependem de dias úteis (Vale Transporte, Café da Manhã).
import { isoDate } from "./calendar";

export type HolidaySource = "NATIONAL" | "MANUAL";
export type HolidayEntry = { date: string; name: string };
export type EffectiveHoliday = { date: string; name: string; source: HolidaySource; manualName?: string; manualId?: string };
export type HolidaySnapshotEntry = { date: string; name: string; source: HolidaySource; manualName?: string };

// Páscoa (algoritmo gregoriano anônimo / Meeus-Jones-Butcher), determinístico para qualquer ano.
export function easterSunday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

export function getBrazilianNationalHolidays(year: number): HolidayEntry[] {
  const easter = easterSunday(year);
  const goodFriday = new Date(Date.UTC(year, easter.month - 1, easter.day - 2));
  const list: HolidayEntry[] = [
    { date: isoDate(year, 1, 1), name: "Confraternização Universal" },
    { date: goodFriday.toISOString().slice(0, 10), name: "Paixão de Cristo (Sexta-feira Santa)" },
    { date: isoDate(year, 4, 21), name: "Tiradentes" },
    { date: isoDate(year, 5, 1), name: "Dia do Trabalho" },
    { date: isoDate(year, 9, 7), name: "Independência do Brasil" },
    { date: isoDate(year, 10, 12), name: "Nossa Senhora Aparecida" },
    { date: isoDate(year, 11, 2), name: "Finados" },
    { date: isoDate(year, 11, 15), name: "Proclamação da República" },
    { date: isoDate(year, 12, 25), name: "Natal" },
  ];
  if (year >= 2024) list.push({ date: isoDate(year, 11, 20), name: "Dia Nacional de Zumbi e da Consciência Negra" });
  return list.sort((left, right) => left.date.localeCompare(right.date));
}

// Feriados efetivos da competência: nacionais (código) + manuais (banco), uma entrada por DATA.
// Na mesma data prevalece o nome nacional (o nome manual fica em manualName): a data conta uma única vez.
export function getEffectiveHolidays(year: number, month: number, manual: { id?: string; date: string; name: string }[]): EffectiveHoliday[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const byDate = new Map<string, EffectiveHoliday>();
  for (const holiday of getBrazilianNationalHolidays(year)) if (holiday.date.startsWith(prefix)) byDate.set(holiday.date, { ...holiday, source: "NATIONAL" });
  for (const holiday of manual) {
    if (!holiday.date.startsWith(prefix)) continue;
    const national = byDate.get(holiday.date);
    if (national) byDate.set(holiday.date, { ...national, manualName: holiday.name, manualId: holiday.id });
    else byDate.set(holiday.date, { date: holiday.date, name: holiday.name, source: "MANUAL", manualId: holiday.id });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export const toHolidaySnapshot = (holidays: EffectiveHoliday[]): HolidaySnapshotEntry[] =>
  holidays.map((holiday) => ({ date: holiday.date, name: holiday.name, source: holiday.source, ...(holiday.manualName ? { manualName: holiday.manualName } : {}) }));
