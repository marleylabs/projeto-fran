"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { NAVIGATION_MODULES } from "@/modules/core/navigation/moduleRegistry";

type SessionUser = { email: string; name: string; roles: string[] };
const glyphs: Record<string,string>={"accounts-payable":"▤",accounting:"▥","master-data":"◇",administration:"⚙",dashboard:"⌂"};
const isActive=(pathname:string,paths:string[]=[])=>paths.some(path=>pathname===path||(path!=="/"&&pathname.startsWith(`${path}/`)));
const initials=(value:string)=>value.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toLocaleUpperCase("pt-BR")).join("")||"U";

export function AppShell({children}:{children:ReactNode}){
  const pathname=usePathname(),router=useRouter(),[open,setOpen]=useState(false),[user,setUser]=useState<SessionUser|null>(null);
  const publicAuthPage=pathname==="/login"||pathname==="/redefinir-senha";
  useEffect(()=>{if(publicAuthPage)return;fetch("/api/auth/me").then(async response=>response.ok?setUser(await response.json()):null).catch(()=>undefined)},[pathname,publicAuthPage]);
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});router.push("/login");router.refresh()}
  if(publicAuthPage)return <>{children}</>;
  const navigation=<><div className="app-brand"><span className="app-brand-mark">GA</span><div><strong>Gestão Administrativa</strong><span>Plataforma corporativa</span></div></div><nav className="app-nav" aria-label="Módulos da plataforma"><p className="app-nav-label">Navegação</p>{NAVIGATION_MODULES.map(module=>{const active=isActive(pathname,module.matchPaths);return module.href?<Link key={module.id} href={module.href} onClick={()=>setOpen(false)} className={clsx("app-nav-item",active&&"is-active")} aria-current={active?"page":undefined}><span aria-hidden="true">{glyphs[module.id]??"·"}</span>{module.label}</Link>:<span key={module.id} className="app-nav-item is-disabled" title="Módulo planejado"><span aria-hidden="true">{glyphs[module.id]??"·"}</span>{module.label}<small>Em breve</small></span>})}</nav><footer className="app-user"><div className="app-avatar">{initials(user?.name||user?.email||"")}</div><div className="min-w-0 flex-1"><strong className="block truncate">{user?.name||"Usuário"}</strong><span className="block truncate">{user?.roles?.[0]||user?.email||"Sessão ativa"}</span></div><button type="button" onClick={logout} aria-label="Sair da aplicação" title="Sair">↪</button></footer></>;
  return <div className="app-shell"><aside className="app-sidebar">{navigation}</aside><header className="app-mobile-header"><button type="button" onClick={()=>setOpen(true)} aria-label="Abrir navegação">☰</button><strong>Gestão Administrativa</strong></header>{open&&<div className="app-drawer" role="dialog" aria-modal="true" aria-label="Navegação"><button className="app-drawer-backdrop" onClick={()=>setOpen(false)} aria-label="Fechar navegação"/><aside>{navigation}</aside></div>}<div className="app-content">{children}</div></div>;
}
