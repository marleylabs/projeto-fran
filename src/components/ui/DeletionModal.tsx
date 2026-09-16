"use client";
import { useEffect,useRef,useState,type ReactNode } from "react";
import { Button } from "./Button";

const reasons=["Arquivo incorreto","Lançamento duplicado","Colaborador lançado incorretamente","Competência incorreta","Outro"];
type DeletionModalProps={open:boolean;title:string;description:ReactNode;count?:number;requireKeyword?:boolean;busy?:boolean;actionLabel?:string;onClose:()=>void;onConfirm:(reason:string)=>void};
function OpenDeletionModal({open,title,description,count=1,requireKeyword=false,busy=false,actionLabel,onClose,onConfirm}:DeletionModalProps){
  const ref=useRef<HTMLDialogElement>(null);const[reason,setReason]=useState("");const[confirmation,setConfirmation]=useState("");
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  const ready=(!requireKeyword||confirmation==="EXCLUIR")&&(!requireKeyword||Boolean(reason));
  return <dialog ref={ref} className="modal" onCancel={busy?event=>event.preventDefault():onClose}><div className="modal-box border border-base-300 bg-base-100"><h2 className="text-lg font-bold text-neutral">{title}</h2><div className="mt-2 text-sm text-secondary">{description}</div>{count>1||requireKeyword?<label className="form-control mt-4"><span className="label-text mb-1">Motivo {requireKeyword?"*":"(opcional)"}</span><select className="select select-bordered w-full" value={reason} onChange={event=>setReason(event.target.value)}><option value="">Selecionar motivo</option>{reasons.map(item=><option key={item}>{item}</option>)}</select></label>:null}{requireKeyword&&<label className="form-control mt-3"><span className="label-text mb-1">Digite <strong>EXCLUIR</strong> para confirmar</span><input className="input input-bordered w-full" autoComplete="off" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>}<div className="modal-action"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button variant="error" disabled={!ready} loading={busy} onClick={()=>onConfirm(reason)}>{actionLabel??(count>1?`Excluir ${count} registros`:requireKeyword?"Excluir lote":"Excluir")}</Button></div></div><form method="dialog" className="modal-backdrop"><button disabled={busy} aria-label="Fechar modal">Fechar</button></form></dialog>;
}
export function DeletionModal(props:DeletionModalProps){return props.open?<OpenDeletionModal {...props}/>:null;}
