"use client";
// Menu flutuante de ações por linha (botão "…"), usado nas tabelas dos módulos para Editar/Excluir etc.
// Controlado pelo pai (`open`/`onOpenChange`); os itens (`children`) são <button>s do consumidor.
// Renderiza num portal com posição `fixed` para não ser cortado por overflow da tabela; se o gatilho estiver dentro de
// um <dialog> nativo, o portal vai para o próprio dialog (fora dele o menu ficaria atrás da top layer do modal).
import { createPortal } from "react-dom";
import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { buttonClassName } from "./Button";
// label: nome acessível do botão gatilho (ex.: "Ações de Fulano").
type Props={open:boolean;onOpenChange:(open:boolean)=>void;label:string;children:ReactNode};
/** Botão "mais ações" + menu em portal. Fecha ao clicar fora, Esc (devolve foco ao gatilho), resize/scroll e ao
 * clicar em qualquer item. Ao abrir, foca o primeiro botão do menu. */
export function FloatingActionMenu({open,onOpenChange,label,children}:Props){
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);const[position,setPosition]=useState({top:0,left:0,visibility:"hidden" as "hidden"|"visible"});const[portalRoot,setPortalRoot]=useState<Element|null>(null);
 // Posicionamento antes do paint: menu de 176x180px alinhado à direita do gatilho; abre para cima quando não cabe
 // abaixo. Começa `hidden` para não piscar na posição (0,0).
 useLayoutEffect(()=>{if(!open||!trigger.current)return;setPortalRoot(trigger.current.closest("dialog")??document.body);const rect=trigger.current.getBoundingClientRect(),width=176,height=180,gap=6;const above=window.innerHeight-rect.bottom<height&&rect.top>height;setPosition({top:above?Math.max(8,rect.top-height-gap):Math.min(window.innerHeight-height-8,rect.bottom+gap),left:Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width)),visibility:"visible"})},[open]);
 // Enquanto aberto: listeners de clique fora / Esc / resize / scroll (captura, pega scroll de qualquer contêiner).
 // Em vez de reposicionar em scroll/resize, simplesmente fecha.
 useEffect(()=>{if(!open)return;const close=(event:MouseEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))onOpenChange(false)};const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){onOpenChange(false);trigger.current?.focus()}};const reposition=()=>onOpenChange(false);document.addEventListener("mousedown",close);document.addEventListener("keydown",key);window.addEventListener("resize",reposition);window.addEventListener("scroll",reposition,true);requestAnimationFrame(()=>menu.current?.querySelector<HTMLElement>("button")?.focus());return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",key);window.removeEventListener("resize",reposition);window.removeEventListener("scroll",reposition,true)}},[open,onOpenChange]);
 return <><button ref={trigger} type="button" className={buttonClassName({variant:"ghost",size:"sm"})} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={()=>onOpenChange(!open)}><MoreHorizontal size={16} aria-hidden="true"/></button>{open&&portalRoot&&createPortal(<div ref={menu} role="menu" style={position} className="fixed z-40 w-44 rounded-control border border-border bg-surface p-1 shadow-elevation-lg" onClick={()=>{onOpenChange(false);trigger.current?.focus()}}>{children}</div>,portalRoot)}</>;
}
