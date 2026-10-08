"use client";
/* eslint-disable react-hooks/preserve-manual-memoization -- filtering a bounded local option list */
// Seleção múltipla de colaboradores (Alimentação, Café da Manhã, Cesta Básica, Vale Transporte, Treinamentos).
// Fase 7G: só o visual mudou (tokens, ícones lucide, caixa de seleção visível, ids únicos por instância); busca,
// filtro por departamento, ordenação, limite de 50 resultados, "selecionar todos" e o estado controlado
// (value/onChange) continuam os mesmos.
import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import clsx from "clsx";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { textInputClassName } from "@/components/ui";
import type { CollaboratorOption } from "./CollaboratorCombobox";
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const compareCollaborator = (a: CollaboratorOption, b: CollaboratorOption) => comparePtBr(a.officialName, b.officialName) || comparePtBr(a.department, b.department) || comparePtBr(a.id, b.id);

export function CollaboratorMultiCombobox({ value, onChange, options, fixedDepartment }: { value: string[]; onChange: (ids: string[]) => void; options: CollaboratorOption[]; fixedDepartment?: string }) {
  const baseId = useId();
  const listId = `${baseId}-options`; const departmentId = `${baseId}-department`; const searchId = `${baseId}-search`; const selectedId = `${baseId}-selected`;
  const [query, setQuery] = useState(""); const [department, setDepartment] = useState(""); const [open, setOpen] = useState(false); const [expanded, setExpanded] = useState(false);
  const active = options.filter((item) => item.active);
  const departments = [...new Set(active.map((item) => item.department))].sort(comparePtBr);
  const effectiveDepartment = fixedDepartment ?? department;
  const results = useMemo(() => active.filter((item) => (!effectiveDepartment || item.department === effectiveDepartment) && (!query || normalize(`${item.officialName} ${item.department} ${item.costCenter}`).includes(normalize(query)))).sort(compareCollaborator).slice(0, 50), [active, effectiveDepartment, query]);
  const selected = options.filter((item) => value.includes(item.id)).sort(compareCollaborator);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((current) => current !== id) : [...value, id]);
  const selectAll = () => onChange([...new Set([...value, ...results.map((item) => item.id)])]);
  const groups = [...selected.reduce((map, item) => map.set(item.department, (map.get(item.department) ?? 0) + 1), new Map<string, number>())].sort(([a], [b]) => comparePtBr(a, b));
  const label = "mb-1.5 block text-label text-foreground";

  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor={departmentId} className={label}>Departamento</label>
        {fixedDepartment
          ? <input id={departmentId} className={clsx(textInputClassName, "bg-surface-muted text-foreground-muted")} value={fixedDepartment} readOnly disabled />
          : <select id={departmentId} className={textInputClassName} value={department} onChange={(event) => { setDepartment(event.target.value); setOpen(true); }}><option value="">Todos os departamentos</option>{departments.map((item) => <option key={item}>{item}</option>)}</select>}
      </div>
      <div className="relative">
        <label htmlFor={searchId} className={label}>Colaboradores <span aria-hidden="true" className="text-primary">*</span><span className="sr-only">(obrigatório)</span></label>
        <span className="relative block">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input id={searchId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} placeholder="Buscar colaboradores..." className={clsx(textInputClassName, "pl-9")} />
        </span>
        {open && (
          <div className="absolute z-40 mt-1 w-full rounded-control border border-border bg-surface p-2 shadow-elevation-lg">
            <div className="flex items-center justify-between gap-2 border-b border-border px-2 pb-2 text-caption text-foreground-muted">
              <span role="status">{results.length} resultado(s)</span>
              {results.length > 0 && <button type="button" className="cursor-pointer font-semibold text-primary hover:underline" onClick={selectAll}>Selecionar todos os resultados</button>}
            </div>
            <div id={listId} role="listbox" aria-multiselectable="true" aria-label="Colaboradores encontrados" className="max-h-64 overflow-y-auto pt-1">
              {results.map((item) => {
                const checked = value.includes(item.id);
                return (
                  <button key={item.id} type="button" role="option" aria-selected={checked} onClick={() => toggle(item.id)} className={clsx("flex w-full cursor-pointer items-start gap-3 rounded-control p-2 text-left focus-visible:outline-2 focus-visible:outline-focus-ring", checked ? "bg-primary-soft" : "hover:bg-surface-muted")}>
                    <span aria-hidden="true" className={clsx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border", checked ? "border-primary bg-primary text-on-primary" : "border-border-strong bg-surface")}>{checked && <Check size={12} strokeWidth={3} />}</span>
                    <span className="min-w-0"><strong className="block truncate text-body">{item.officialName}</strong><small className="text-caption text-foreground-muted">{item.department} · {item.costCenter || "Sem centro de custo"}</small></span>
                  </button>
                );
              })}
              {!results.length && <p className="p-3 text-body text-foreground-muted">Nenhum colaborador encontrado.</p>}
            </div>
            <button type="button" className="mt-1 w-full cursor-pointer border-t border-border pt-2 text-body font-semibold text-primary" onClick={() => setOpen(false)}>Concluir seleção</button>
          </div>
        )}
      </div>
      <div className="rounded-control border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-label text-foreground-muted">Colaboradores selecionados</p>
            <strong className="text-body">{selected.length} colaborador(es)</strong>
          </div>
          {selected.length > 0 && <button type="button" aria-expanded={expanded} aria-controls={selectedId} className="inline-flex cursor-pointer items-center gap-1 text-body font-semibold text-primary" onClick={() => setExpanded((current) => !current)}>{expanded ? "Ocultar" : "Ver selecionados"}{expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</button>}
        </div>
        {groups.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{groups.map(([name, count]) => <span key={name} className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-0.5 text-caption text-foreground">{name}: {count}</span>)}</div>}
        {expanded && (
          <ul id={selectedId} className="mt-3 grid gap-2 border-t border-border pt-3">
            {selected.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-control bg-surface-muted p-2">
                <div className="flex min-w-0 items-start gap-2">
                  <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-success-text" />
                  <div className="min-w-0"><strong className="block truncate text-body">{item.officialName}</strong><small className="text-caption text-foreground-muted">{item.department} · {item.costCenter || "Sem CC"}</small></div>
                </div>
                <button type="button" aria-label={`Remover ${item.officialName}`} className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-caption font-semibold text-primary" onClick={() => toggle(item.id)}><X size={12} aria-hidden="true" />Remover</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
