"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Arquitetura de AÇÕES CONTEXTUAIS no header do shell (ex.: Novo, Importar, Exportar).
// A página declara <PageActions>…</PageActions> e o conteúdo aparece no header enquanto ela estiver montada.
// (Nesta fase nenhuma página foi migrada: as ações atuais continuam onde estão.)
// Contexto guarda o nó de ações atual; o provider fica no AppShell e o header lê via useShellActions.
type ShellActionsContextValue = { actions: ReactNode; setActions: (actions: ReactNode) => void };
const ShellActionsContext = createContext<ShellActionsContextValue | null>(null);

/** Provedor das ações contextuais; montado pelo AppShell em volta do header e do conteúdo. */
export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return <ShellActionsContext.Provider value={{ actions, setActions }}>{children}</ShellActionsContext.Provider>;
}

/** Lê as ações registradas pela página atual (null quando nenhuma). Usado pelo AppHeader. */
export function useShellActions() {
  return useContext(ShellActionsContext)?.actions ?? null;
}

/** Registra `children` como ações do header enquanto montado e limpa ao desmontar. Não renderiza nada no lugar.
 * Atenção: `children` novo a cada render dispara o efeito de novo; prefira conteúdo estável (memoizado). */
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
