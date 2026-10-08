"use client";
// Calendário de competência + modal de feriado — compartilhado entre módulos com competência
// mensal (Vale Transporte, Café da Manhã, futuros). Feriados nacionais automáticos não
// são editáveis; feriados manuais (estaduais/municipais/internos) podem ser criados/editados/
// removidos aqui. Extraído para não duplicar a experiência já aprovada do Vale Transporte.
// Fase 7G: visual nos tokens do Design System (sem cores cruas nem title=), estado do dia por texto acessível,
// ícone e legenda (nunca só cor) e modal sobre o Dialog da foundation. A grade, os dias úteis/feriados e os
// callbacks continuam os mesmos (buildCompetenceCalendar + onSelect/onSave/onRemove).
import { useEffect, useId, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import clsx from "clsx";
import { Button, Dialog, Field, TextInput } from "@/components/ui";
import { buildCompetenceCalendar } from "@/modules/shared/calendar";

export type Holiday = { date: string; name: string; source: "NATIONAL" | "MANUAL"; editable: boolean; manualName: string | null };
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CompetenceCalendar({ year, month, holidays, onSelect }: { year: number; month: number; holidays: Holiday[]; onSelect: (date: string) => void }) {
  const days = useMemo(() => buildCompetenceCalendar(year, month, holidays.map((holiday) => holiday.date)), [year, month, holidays]);
  const names = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));
  const sources = new Map(holidays.map((holiday) => [holiday.date, holiday.source]));
  const offset = days[0]?.weekday ?? 0;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-caption font-semibold text-foreground-muted" aria-hidden="true">{WEEKDAYS.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label="Calendário da competência">
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {days.map((day) => {
          const name = names.get(day.date);
          const source = day.holiday ? (sources.get(day.date) === "NATIONAL" ? "feriado nacional" : "feriado cadastrado manualmente") : "";
          return (
            <button
              key={day.date} type="button" onClick={() => onSelect(day.date)}
              aria-label={`${day.day}: ${day.holiday ? `feriado${name ? ` — ${name}` : ""}${source ? ` (${source})` : ""}${day.weekend ? " · final de semana, não reduz dias úteis" : ""}` : day.weekend ? "final de semana" : "dia útil"}. Clique para ${day.holiday && sources.get(day.date) === "NATIONAL" ? "ver o feriado" : day.holiday ? "editar ou remover o feriado" : "marcar feriado"}.`}
              className={clsx(
                "relative flex h-10 cursor-pointer items-center justify-center rounded-control border text-body tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring motion-reduce:transition-none",
                day.holiday ? "border-success/40 bg-success-soft font-semibold text-success-text hover:bg-success/15" : day.weekend ? "border-transparent bg-surface-muted text-foreground-muted hover:bg-border" : "border-border bg-surface text-foreground hover:bg-surface-muted",
                day.holiday && day.weekend && "border-dashed",
              )}
            >
              {day.day}
              {day.holiday && <CalendarDays size={10} aria-hidden="true" className="absolute right-0.5 top-0.5" />}
            </button>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-foreground-muted" aria-label="Legenda">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-sm border border-border bg-surface" />Dia útil</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-sm bg-surface-muted ring-1 ring-inset ring-border" />Final de semana</li>
        <li className="flex items-center gap-1.5"><CalendarDays size={12} aria-hidden="true" className="text-success-text" />Feriado</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-sm border border-dashed border-success/60 bg-success-soft" />Feriado em final de semana (não reduz dias úteis)</li>
      </ul>
    </div>
  );
}

export function HolidayModal({ date, holiday, onClose, onSave, onRemove }: { date: string | null; holiday: Holiday | null; onClose: () => void; onSave: (name: string) => Promise<void>; onRemove: () => Promise<void> }) {
  const formId = `${useId()}-holiday`;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- abrir o modal em outra data recarrega o nome do feriado
  useEffect(() => { setName(holiday?.name ?? ""); }, [date, holiday]);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };
  const national = Boolean(holiday && !holiday.editable);
  return (
    <Dialog
      open={date !== null}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={national ? "Feriado nacional" : holiday ? "Editar feriado" : "Marcar feriado"}
      description={date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : undefined}
      footer={<>
        {holiday?.editable && <Button variant="error" className="mr-auto" onClick={() => void run(onRemove)} disabled={busy}>Remover feriado</Button>}
        <Button variant="secondary" onClick={onClose} disabled={busy}>{national ? "Fechar" : "Cancelar"}</Button>
        {!national && <Button type="submit" form={formId} loading={busy} disabled={busy || !name.trim()}>Salvar feriado</Button>}
      </>}
    >
      {national && holiday ? (
        <div className="grid gap-1 rounded-control border border-border bg-surface-muted p-3 text-body">
          <strong>{holiday.name}</strong>
          <p className="text-caption text-foreground-muted">Feriado nacional automático: não pode ser editado nem removido. Feriados estaduais, municipais ou internos devem ser cadastrados nas demais datas.</p>
          {holiday.manualName && <p className="text-caption text-foreground-muted">Também cadastrado manualmente como “{holiday.manualName}” (a data conta uma única vez).</p>}
        </div>
      ) : (
        <form id={formId} className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => onSave(name)); }}>
          {holiday && <p className="text-caption text-foreground-muted">Feriado cadastrado manualmente</p>}
          <Field label="Nome do feriado" required>{(control) => <TextInput {...control} required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Aniversário da cidade" />}</Field>
        </form>
      )}
    </Dialog>
  );
}
