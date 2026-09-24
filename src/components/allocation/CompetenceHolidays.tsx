"use client";
// Calendário de competência + modal de feriado — compartilhado entre módulos com competência
// mensal (Vale Transporte, Café da Manhã, futuros). Feriados nacionais automáticos (verde) não
// são editáveis; feriados manuais (estaduais/municipais/internos) podem ser criados/editados/
// removidos aqui. Extraído para não duplicar a experiência já aprovada do Vale Transporte.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
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
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-secondary" aria-hidden="true">{WEEKDAYS.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Calendário da competência">
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => (
          <button
            key={day.date} type="button" role="gridcell" onClick={() => onSelect(day.date)}
            title={day.holiday ? `${names.get(day.date) ?? "Feriado"} · ${sources.get(day.date) === "NATIONAL" ? "Feriado nacional" : "Feriado cadastrado manualmente"}${day.weekend ? " (final de semana — não reduz dias úteis)" : ""}` : day.weekend ? "Final de semana" : "Dia útil"}
            aria-label={`${day.day}: ${day.holiday ? `feriado${names.get(day.date) ? ` — ${names.get(day.date)}` : ""}${day.weekend ? " (final de semana)" : ""}` : day.weekend ? "final de semana" : "dia útil"}`}
            className={`flex h-10 flex-col items-center justify-center rounded-md border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${day.holiday ? `border-emerald-500 bg-emerald-100 font-bold text-emerald-900 hover:bg-emerald-200${day.weekend ? " ring-2 ring-inset ring-orange-300" : ""}` : day.weekend ? "border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100" : "border-base-300 bg-base-100 hover:bg-base-200"}`}
          >
            {day.day}
          </button>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-secondary" aria-label="Legenda">
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-base-300 bg-base-100" />Dia útil</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-orange-200 bg-orange-50" />Final de semana</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-emerald-500 bg-emerald-100" />Feriado</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-emerald-500 bg-emerald-100 ring-2 ring-inset ring-orange-300" />Feriado em final de semana</li>
      </ul>
    </div>
  );
}

export function HolidayModal({ date, holiday, onClose, onSave, onRemove }: { date: string | null; holiday: Holiday | null; onClose: () => void; onSave: (name: string) => Promise<void>; onRemove: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current; if (!dialog) return;
    if (date && !dialog.open) dialog.showModal();
    if (!date && dialog.open) dialog.close();
    setName(holiday?.name ?? "");
  }, [date, holiday]);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };
  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <form className="modal-box max-w-md border border-base-300 bg-base-100" onSubmit={(event) => { event.preventDefault(); void run(() => onSave(name)); }}>
        <h2 className="text-lg font-bold text-neutral">{holiday && !holiday.editable ? "Feriado nacional" : holiday ? "Editar feriado" : "Marcar feriado"}</h2>
        <p className="mt-1 text-sm text-secondary">{date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : ""}</p>
        {holiday && !holiday.editable ? <div className="mt-4 rounded-lg border border-base-300 bg-base-200/60 p-3 text-sm"><strong>{holiday.name}</strong><p className="mt-1 text-xs text-secondary">Feriado nacional automático: não pode ser editado nem removido. Feriados estaduais, municipais ou internos devem ser cadastrados nas demais datas.</p>{holiday.manualName && <p className="mt-1 text-xs text-secondary">Também cadastrado manualmente como “{holiday.manualName}” (a data conta uma única vez).</p>}</div> : <>
        {holiday && <p className="mt-1 text-xs text-secondary">Feriado cadastrado manualmente</p>}
        <label className="form-control mt-4"><span className="label-text mb-1">Nome do feriado</span><input required autoFocus className="input input-bordered w-full" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Aniversário da cidade" /></label></>}
        <div className="modal-action">
          {holiday?.editable && <Button type="button" variant="error" onClick={() => void run(onRemove)} disabled={busy}>Remover feriado</Button>}
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{holiday && !holiday.editable ? "Fechar" : "Cancelar"}</Button>
          {!(holiday && !holiday.editable) && <Button type="submit" loading={busy} disabled={busy || !name.trim()}>Salvar feriado</Button>}
        </div>
      </form>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar">Fechar</button></form>
    </dialog>
  );
}
