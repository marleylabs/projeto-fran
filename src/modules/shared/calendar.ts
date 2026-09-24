// Funções puras de calendário de competência (sem Prisma/server-only), compartilhadas por
// qualquer módulo que precise de "dias úteis de um mês, dados os feriados daquele mês"
// (Vale Transporte, Café da Manhã, e futuros módulos). A MESMA fórmula roda no backend
// (fonte da verdade) e no frontend (apenas prévia).

export type CalendarDayKind = "WORKING" | "WEEKEND" | "HOLIDAY";
export type CalendarDay = { date: string; day: number; weekday: number; weekend: boolean; holiday: boolean; kind: CalendarDayKind; countsAsWorking: boolean };

const pad = (value: number) => String(value).padStart(2, "0");
export const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const weekdayOf = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

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
