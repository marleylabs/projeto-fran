"use client";
import { useEffect,useRef,useState,type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { Field, TextInput, textInputClassName } from "./Field";

const reasons=["Arquivo incorreto","Lançamento duplicado","Colaborador lançado incorretamente","Competência incorreta","Outro"];
// Devolve o foco a quem abriu o modal, só se o elemento ainda estiver na página (após uma exclusão bem-sucedida o
// gatilho pode ter sido removido: nesse caso o fluxo normal segue, sem focar elemento inexistente).
export function restoreDeletionFocus(opener:{isConnected:boolean;focus:()=>void}|null|undefined){if(opener?.isConnected)opener.focus();}
type DeletionModalProps={open:boolean;title:string;description:ReactNode;count?:number;requireKeyword?:boolean;busy?:boolean;actionLabel?:string;onClose:()=>void;onConfirm:(reason:string)=>void};
function OpenDeletionModal({open,title,description,count=1,requireKeyword=false,busy=false,actionLabel,onClose,onConfirm}:DeletionModalProps){
  const ref=useRef<HTMLDialogElement>(null);const opener=useRef<HTMLElement|null>(null);const[reason,setReason]=useState("");const[confirmation,setConfirmation]=useState("");
  // Foco: guarda o gatilho ao montar (o modal só existe enquanto aberto) e o devolve ao fechar — Cancelar/Esc/conclusão
  // desmontam o componente; o backdrop fecha o <dialog> nativo (evento close).
  useEffect(()=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;const dialog=ref.current;const restore=()=>restoreDeletionFocus(opener.current);dialog?.addEventListener("close",restore);return()=>{dialog?.removeEventListener("close",restore);restore();};},[]);
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  const ready=(!requireKeyword||confirmation==="EXCLUIR")&&(!requireKeyword||Boolean(reason));
  // Fase 7M: visual da fundação (mesmo <dialog> nativo e mesma lógica de foco/confirmação). Backdrop e Esc fecham pelo
  // onClose (exceto durante a operação); motivo e palavra-chave usam Field/TextInput com rótulo ligado.
  return <dialog ref={ref} aria-labelledby="deletion-modal-title" aria-describedby="deletion-modal-description" onCancel={busy?event=>event.preventDefault():onClose} onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}} className="m-auto w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-modal border border-border bg-surface p-0 text-foreground shadow-elevation-lg backdrop:bg-neutral-dark/50 motion-safe:backdrop:backdrop-blur-[2px]"><div className="flex max-h-[min(90vh,52rem)] flex-col">
    <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4"><div className="min-w-0"><h2 id="deletion-modal-title" className="text-section-title text-foreground">{title}</h2><div id="deletion-modal-description" className="mt-1 text-body text-foreground-muted">{description}</div></div><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar" className="-mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><X size={18} aria-hidden="true"/></button></header>
    {(count>1||requireKeyword)&&<div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-4">
      <Field label={`Motivo ${requireKeyword?"":"(opcional)"}`.trim()} required={requireKeyword}>{control=><select {...control} className={textInputClassName} value={reason} onChange={event=>setReason(event.target.value)}><option value="">Selecionar motivo</option>{reasons.map(item=><option key={item}>{item}</option>)}</select>}</Field>
      {requireKeyword&&<Field label={<>Digite <strong>EXCLUIR</strong> para confirmar</>} required>{control=><TextInput {...control} autoComplete="off" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/>}</Field>}
    </div>}
    <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button variant="error" disabled={!ready} loading={busy} onClick={()=>onConfirm(reason)}>{actionLabel??(count>1?`Excluir ${count} registros`:requireKeyword?"Excluir lote":"Excluir")}</Button></footer>
  </div></dialog>;
}
export function DeletionModal(props:DeletionModalProps){return props.open?<OpenDeletionModal {...props}/>:null;}
