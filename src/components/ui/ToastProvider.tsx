"use client";

import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from "react";
import clsx from "clsx";

export type ToastType="info"|"success"|"warning"|"error";
type ToastInput={type?:ToastType;title?:string;message:string;duration?:number};
type ToastItem=ToastInput&{id:number;type:ToastType;closing?:boolean};
type ToastApi={notify:(input:ToastInput)=>number;success:(message:string,title?:string)=>number;error:(message:string,title?:string)=>number;warning:(message:string,title?:string)=>number;info:(message:string,title?:string)=>number;dismiss:(id:number)=>void};
const ToastContext=createContext<ToastApi|null>(null);
const durations:Record<ToastType,number>={success:3500,info:4500,warning:5500,error:7000};
const icons:Record<ToastType,string>={success:"✓",error:"×",warning:"!",info:"i"};

function ToastCard({toast,onDismiss}:{toast:ToastItem;onDismiss:(id:number)=>void}){
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),remaining=useRef(toast.duration??durations[toast.type]),started=useRef(0);
 const start=useCallback(()=>{started.current=Date.now();timer.current=setTimeout(()=>onDismiss(toast.id),remaining.current)},[onDismiss,toast.id]);
 const pause=useCallback(()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;remaining.current=Math.max(0,remaining.current-(Date.now()-started.current))}},[]);
 useEffect(()=>{start();return()=>{if(timer.current)clearTimeout(timer.current)}},[start]);
 return <div role={toast.type==="error"?"alert":"status"} aria-live={toast.type==="error"?"assertive":"polite"} onMouseEnter={pause} onMouseLeave={start} className={clsx("alert pointer-events-auto grid grid-cols-[auto_1fr_auto] items-start gap-2 shadow-lg toast-card",`alert-${toast.type}`,toast.closing&&"toast-card-closing")}>
  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">{icons[toast.type]}</span>
  <div className="min-w-0">{toast.title&&<strong className="block font-semibold">{toast.title}</strong>}<p className="break-words text-xs">{toast.message}</p></div>
  <button type="button" aria-label="Fechar notificação" onClick={()=>onDismiss(toast.id)} className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2">×</button>
 </div>
}

export function ToastProvider({children}:{children:ReactNode}){
 const[toasts,setToasts]=useState<ToastItem[]>([]),sequence=useRef(0);
 const dismiss=useCallback((id:number)=>{setToasts(current=>current.map(item=>item.id===id?{...item,closing:true}:item));setTimeout(()=>setToasts(current=>current.filter(item=>item.id!==id)),200)},[]);
 const notify=useCallback((input:ToastInput)=>{const id=++sequence.current;setToasts(current=>[...current.slice(-3),{...input,id,type:input.type??"info"}]);return id},[]);
 const api=useMemo<ToastApi>(()=>({notify,dismiss,success:(message,title)=>notify({type:"success",message,title}),error:(message,title)=>notify({type:"error",message,title}),warning:(message,title)=>notify({type:"warning",message,title}),info:(message,title)=>notify({type:"info",message,title})}),[dismiss,notify]);
 return <ToastContext.Provider value={api}>{children}<div className="pointer-events-none fixed inset-x-4 top-4 z-40 flex flex-col items-end gap-3 sm:left-auto sm:right-5 sm:w-full sm:max-w-[400px]" aria-label="Notificações">{toasts.map(toast=><ToastCard key={toast.id} toast={toast} onDismiss={dismiss}/>)}</div></ToastContext.Provider>
}

export function useToast(){const context=useContext(ToastContext);if(!context)throw new Error("useToast deve ser utilizado dentro de ToastProvider.");return context}
