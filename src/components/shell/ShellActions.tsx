"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Arquitetura de AÇÕES CONTEXTUAIS no header do shell (ex.: Novo, Importar, Exportar).
// A página declara <PageActions>…</PageActions> e o conteúdo aparece no header enquanto ela estiver montada.
// (Nesta fase nenhuma página foi migrada: as ações atuais continuam onde estão.)
type ShellActionsContextValue = { actions: ReactNode; setActions: (actions: ReactNode) => void };
const ShellActionsContext = createContext<ShellActionsContextValue | null>(null);

export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return <ShellActionsContext.Provider value={{ actions, setActions }}>{children}</ShellActionsContext.Provider>;
}

export function useShellActions() {
  return useContext(ShellActionsContext)?.actions ?? null;
}

export function PageActions({ children }: { children: ReactNode }) {
  const context = useContext(ShellActionsContext);
  const setActions = context?.setActions;
  useEffect(() => {
    if (!setActions) return;
    setActions(children);
    return () => setActions(null);
  }, [children, setActions]);
  return null;
}
