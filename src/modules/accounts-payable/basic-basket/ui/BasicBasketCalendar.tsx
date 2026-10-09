// Calendário SOMENTE LEITURA da Cesta Básica (sem cadastro/edição de feriado): feriados de todas as fontes e o
// pagamento em destaque. Mantido separado do CompetenceCalendar (interativo, com edição de feriado, usado no Vale
// Transporte e no Café da Manhã) para não alterar aqueles módulos; mesmo helper de grade (buildCompetenceCalendar).
import { Banknote, CalendarDays } from "lucide-react";
import clsx from "clsx";
import { buildCompetenceCalendar } from "@/modules/shared/calendar";
import type { BasicBasketHoliday } from "../calculations";

export const HOLIDAY_SOURCE_LABEL = { NATIONAL: "Feriado nacional", TRANSIT_VOUCHER: "Feriado manual (Vale Transporte)", BREAKFAST: "Feriado manual (Café da Manhã)" } as const;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function BasicBasketCalendar({ year, month, holidays, paymentDate }: { year: number; month: number; holidays: BasicBasketHoliday[]; paymentDate: string }) {
  const byDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  const days = buildCompetenceCalendar(year, month, holidays.map((holiday) => holiday.date));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-caption font-semibold text-foreground-muted" aria-hidden="true">{WEEKDAYS.map((label) => <span key={label}>{label}</span>)}</div>
      <ol className="mt-1 grid grid-cols-7 gap-1" aria-label="Calendário da competência (somente leitura)">
        {Array.from({ length: days[0]?.weekday ?? 0 }, (_, index) => <li key={`blank-${index}`} aria-hidden="true" />)}
        {days.map((day) => {
          const holiday = byDate.get(day.date);
          const payment = day.date === paymentDate;
          const description = [payment ? "Pagamento da Cesta Básica" : "", holiday ? `${holiday.names.join(" / ")} — ${holiday.sources.map((source) => HOLIDAY_SOURCE_LABEL[source]).join(", ")}` : "", day.weekend ? "Final de semana" : ""].filter(Boolean).join(" · ") || "Dia comum";
          return (
            <li
              key={day.date}
              aria-label={`${day.day}: ${description}`}
              className={clsx(
                "relative flex h-9 flex-col items-center justify-center rounded-control border text-body tabular-nums",
                holiday ? "border-success/40 bg-success-soft font-semibold text-success-text" : day.weekend ? "border-transparent bg-surface-muted text-foreground-muted" : "border-border bg-surface text-foreground",
                payment && "border-primary bg-primary-soft font-semibold text-primary ring-1 ring-primary",
              )}
            >
              {day.day}
              {payment && <Banknote size={11} aria-hidden="true" className="absolute right-0.5 top-0.5" />}
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-foreground-muted" aria-label="Legenda">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-sm bg-surface-muted" />Final de semana</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-sm border border-success/40 bg-success-soft" />Feriado</li>
        <li className="flex items-center gap-1.5"><Banknote size={12} aria-hidden="true" className="text-primary" />Pagamento da Cesta Básica</li>
      </ul>
    </div>
  );
}

export function BasicBasketHolidayList({ holidays }: { holidays: BasicBasketHoliday[] }) {
  if (!holidays.length) return <p className="text-body text-foreground-muted">Nenhum feriado na competência.</p>;
  return (
    <ul className="grid gap-1.5">
      {holidays.map((holiday) => (
        <li key={holiday.date} className="flex items-start gap-2 text-body">
          <CalendarDays size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-success-text" />
          <span className="min-w-0">
            <strong className="tabular-nums">{holiday.date.slice(8, 10)}/{holiday.date.slice(5, 7)}</strong> — {holiday.names.join(" / ")}
            <span className="block text-caption text-foreground-muted">{holiday.sources.map((source) => HOLIDAY_SOURCE_LABEL[source]).join(" · ")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
