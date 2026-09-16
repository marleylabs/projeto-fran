"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function datesInPeriod(minDate: string, maxDate: string) {
  const [year, month, first] = minDate.split("-").map(Number);
  const last = Number(maxDate.slice(-2));
  return Array.from({ length: last - first + 1 }, (_, index) => iso(year, month, first + index));
}

export function MultiDatePicker({ value, onChange, minDate, maxDate }: {
  value: string[];
  onChange: (dates: string[]) => void;
  minDate: string;
  maxDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const dialog = useRef<HTMLDivElement>(null);
  const [year, month] = minDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const allowed = useMemo(() => new Set(datesInPeriod(minDate, maxDate)), [minDate, maxDate]);
  useEffect(() => { if (open) requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("button[data-day]:not(:disabled)")?.focus()); }, [open]);
  const sorted = (dates: string[]) => [...dates].sort();
  const summary = value.length === 1
    ? new Date(`${value[0]}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : value.length ? `${value.length} datas selecionadas` : "Selecionar datas";
  return <div className="relative min-w-0">
    <Button type="button" variant="secondary" className="w-full justify-start" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDraft(value); setOpen(true); }}>📅 {summary}</Button>
    {value.length > 1 && <p className="mt-1 truncate text-xs text-secondary">{new Date(`${value[0]}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })} → {new Date(`${value[value.length - 1]}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>}
    {open && <div ref={dialog} role="dialog" aria-modal="true" aria-label="Selecionar datas" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-base-300 bg-base-100 p-3 shadow-xl">
      <div className="mb-3 flex items-center justify-between"><strong>{new Date(Date.UTC(year, month - 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)} aria-label="Fechar calendário">✕</button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="Calendário de seleção múltipla">
        {['D','S','T','Q','Q','S','S'].map((day, index) => <span key={`${day}-${index}`} className="py-1 font-semibold text-secondary">{day}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: lastDay }, (_, index) => { const date=iso(year,month,index+1); const selected=draft.includes(date); const enabled=allowed.has(date); return <button data-day type="button" key={date} disabled={!enabled} aria-pressed={selected} aria-label={`${selected ? "Remover" : "Selecionar"} ${new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`} onClick={() => setDraft(current => sorted(selected ? current.filter(item => item !== date) : [...current,date]))} className={`aspect-square rounded-md border text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-transparent disabled:opacity-25 ${selected ? "border-primary bg-primary font-bold text-primary-content ring-2 ring-primary/30" : "border-transparent hover:border-primary hover:bg-primary/10"}`}>{index+1}{selected && <span className="sr-only"> selecionada</span>}</button>; })}
      </div>
      <p aria-live="polite" className="mt-3 text-sm font-semibold">{draft.length} {draft.length === 1 ? "data selecionada" : "datas selecionadas"}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button type="button" size="sm" variant="secondary" onClick={() => setDraft(datesInPeriod(minDate,maxDate))}>Selecionar todo o período</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDraft([])}>Limpar seleção</Button><Button type="button" size="sm" className="sm:col-span-2" onClick={() => { onChange(sorted(draft)); setOpen(false); }}>Aplicar datas</Button></div>
    </div>}
  </div>;
}
