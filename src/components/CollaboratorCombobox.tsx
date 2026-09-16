"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { comparePtBr } from "@/lib/sorting/ptBr";

export type CollaboratorOption = { id: string; officialName: string; jobTitle: string; department: string; costCenter: string; active: boolean };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function CollaboratorCombobox({ value, onChange, options, onCreate, includeInactive=false }: { value: string; onChange: (value: CollaboratorOption) => void; options: CollaboratorOption[]; onCreate?: (query: string) => void; includeInactive?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
  const selected = options.find((item) => item.id === value);
  const matches = useMemo(() => options.filter((item) => (includeInactive||item.active) && normalize(`${item.officialName} ${item.department} ${item.costCenter}`).includes(normalize(query))).sort((a,b)=>comparePtBr(a.officialName,b.officialName)||comparePtBr(a.department,b.department)||comparePtBr(a.id,b.id)).slice(0, query.trim() ? 40 : 8), [options, query, includeInactive]);
  const close = () => { setOpen(false); setQuery(""); setActive(0); };
  const choose = (item: CollaboratorOption) => { onChange(item); close(); requestAnimationFrame(() => input.current?.focus()); };

  useEffect(() => {
    if (!open) return;
    setPortalRoot(input.current?.closest("dialog") ?? document.body);
    const place = () => { const rect=input.current?.getBoundingClientRect(); if(!rect)return; const width=Math.min(Math.max(rect.width,320),window.innerWidth-16); setPosition({top:rect.bottom+6,left:Math.min(Math.max(8,rect.left),window.innerWidth-width-8),width}); };
    const closeOutside = (event: MouseEvent) => { const node=event.target as Node; if(!input.current?.contains(node)&&!panel.current?.contains(node))close(); };
    place(); window.addEventListener("resize",place); window.addEventListener("scroll",place,true); document.addEventListener("mousedown",closeOutside);
    return () => { window.removeEventListener("resize",place); window.removeEventListener("scroll",place,true); document.removeEventListener("mousedown",closeOutside); };
  },[open]);

  const dropdown = open && portalRoot ? createPortal(<div ref={panel} style={position} className="fixed z-[100] rounded-lg border border-base-300 bg-base-100 p-2 shadow-xl"><div id={listId} role="listbox" className="max-h-64 overflow-y-auto">{matches.map((item, index) => <button id={item.id} key={item.id} type="button" role="option" aria-selected={item.id === value} onMouseDown={(event)=>event.preventDefault()} onClick={() => choose(item)} className={`block w-full rounded-md px-3 py-2 text-left ${index === active ? "bg-primary/10" : "hover:bg-base-200"}`}><strong className="block text-sm">{item.officialName}</strong><span className="block truncate text-xs text-secondary">{item.department} · {item.costCenter || "Sem centro de custo"}</span></button>)}{!matches.length && <div className="p-3 text-sm text-secondary"><p>Nenhum colaborador encontrado.</p>{onCreate && <button type="button" className="mt-2 font-semibold text-primary" onMouseDown={(event)=>event.preventDefault()} onClick={() => onCreate(query)}>Cadastrar novo colaborador</button>}</div>}</div></div>, portalRoot) : null;

  return <div className="min-w-0"><input ref={input} role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open} aria-activedescendant={matches[active]?.id} autoComplete="off" value={open ? query : selected?.officialName ?? ""} placeholder="Digite para pesquisar..." title={selected?.officialName} onFocus={()=>{setQuery(selected?.officialName??"");setActive(0);setOpen(true)}} onClick={(event)=>event.currentTarget.select()} onChange={(event)=>{setQuery(event.target.value);setActive(0);setOpen(true)}} onKeyDown={(event)=>{if(event.key==="Escape"){event.preventDefault();close()}if(event.key==="Tab")close();if(event.key==="ArrowDown"){event.preventDefault();setActive(index=>Math.min(index+1,matches.length-1))}if(event.key==="ArrowUp"){event.preventDefault();setActive(index=>Math.max(index-1,0))}if(event.key==="Enter"&&matches[active]){event.preventDefault();choose(matches[active])}}} className="input input-bordered w-full"/>{dropdown}</div>;
}
