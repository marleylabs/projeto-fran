"use client";

// Notificações temporárias (toasts) da aplicação. ToastProvider é montado uma vez em app/layout.tsx; qualquer
// componente cliente usa `useToast()` para notify/success/error/warning/info/dismiss.
// Regras: no máximo 4 toasts simultâneos (os mais antigos saem), duração por tipo (erro fica mais tempo), pausa o
// timer com o mouse em cima, erro é anunciado como alert/assertive e os demais como status/polite.
import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";

/** Tipo do toast: define cor, ícone, duração padrão e a urgência do anúncio para leitor de tela. */
export type ToastType="info"|"success"|"warning"|"error";
// duration em ms sobrescreve o padrão do tipo (`durations`).
type ToastInput={type?:ToastType;title?:string;message:string;duration?:number};
// closing: marcado ao dispensar para tocar a animação de saída antes de remover da lista.
type ToastItem=ToastInput&{id:number;type:ToastType;closing?:boolean};
type ToastApi={notify:(input:ToastInput)=>number;success:(message:string,title?:string)=>number;error:(message:string,title?:string)=>number;warning:(message:string,title?:string)=>number;info:(message:string,title?:string)=>number;dismiss:(id:number)=>void};
const ToastContext=createContext<ToastApi|null>(null);
const durations:Record<ToastType,number>={success:3500,info:4500,warning:5500,error:7000};
// Fase 7M: ícones lucide no lugar de glifos (✓ × ! i).
const icons:Record<ToastType,LucideIcon>={success:CheckCircle2,error:XCircle,warning:AlertTriangle,info:Info};

// Um toast. O timer guarda o tempo restante para retomar de onde parou após o hover (pause/start).
function ToastCard({toast,onDismiss}:{toast:ToastItem;onDismiss:(id:number)=>void}){
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),remaining=useRef(toast.duration??durations[toast.type]),started=useRef(0);
 const start=useCallback(()=>{started.current=Date.now();timer.current=setTimeout(()=>onDismiss(toast.id),remaining.current)},[onDismiss,toast.id]);
 const pause=useCallback(()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;remaining.current=Math.max(0,remaining.current-(Date.now()-started.current))}},[]);
 useEffect(()=>{start();return()=>{if(timer.current)clearTimeout(timer.current)}},[start]);
 const Icon=icons[toast.type];
 return <div role={toast.type==="error"?"alert":"status"} aria-live={toast.type==="error"?"assertive":"polite"} onMouseEnter={pause} onMouseLeave={start} className={clsx("alert pointer-events-auto grid grid-cols-[auto_1fr_auto] items-start gap-2 shadow-lg toast-card",`alert-${toast.type}`,toast.closing&&"toast-card-closing")}>
  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center"><Icon size={18}/></span>
  <div className="min-w-0">{toast.title&&<strong className="block font-semibold">{toast.title}</strong>}<p className="break-words text-xs">{toast.message}</p></div>
  <button type="button" aria-label="Fechar notificação" onClick={()=>onDismiss(toast.id)} className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2"><X size={16} aria-hidden="true"/></button>
 </div>
}

/** Provedor do contexto de toasts + região fixa no topo direito onde eles aparecem. */
export function ToastProvider({children}:{children:ReactNode}){
 const[toasts,setToasts]=useState<ToastItem[]>([]),sequence=useRef(0);
 // Remove em duas etapas: marca closing (animação) e retira da lista 200ms depois.
 const dismiss=useCallback((id:number)=>{setToasts(current=>current.map(item=>item.id===id?{...item,closing:true}:item));setTimeout(()=>setToasts(current=>current.filter(item=>item.id!==id)),200)},[]);
 // Mantém só os 3 últimos + o novo (máximo 4 na tela). Devolve o id para permitir dismiss manual.
 const notify=useCallback((input:ToastInput)=>{const id=++sequence.current;setToasts(current=>[...current.slice(-3),{...input,id,type:input.type??"info"}]);return id},[]);
 const api=useMemo<ToastApi>(()=>({notify,dismiss,success:(message,title)=>notify({type:"success",message,title}),error:(message,title)=>notify({type:"error",message,title}),warning:(message,title)=>notify({type:"warning",message,title}),info:(message,title)=>notify({type:"info",message,title})}),[dismiss,notify]);
 return <ToastContext.Provider value={api}>{children}<div className="pointer-events-none fixed inset-x-4 top-4 z-40 flex flex-col items-end gap-3 sm:left-auto sm:right-5 sm:w-full sm:max-w-[400px]" aria-label="Notificações">{toasts.map(toast=><ToastCard key={toast.id} toast={toast} onDismiss={dismiss}/>)}</div></ToastContext.Provider>
}

/** Acesso à API de toasts. Lança erro se usado fora do ToastProvider (falha cedo em vez de silenciar). */
export function useToast(){const context=useContext(ToastContext);if(!context)throw new Error("useToast deve ser utilizado dentro de ToastProvider.");return context}
