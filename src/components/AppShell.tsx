"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { AppHeader } from "@/components/shell/AppHeader";
import { ShellActionsProvider } from "@/components/shell/ShellActions";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { resolveRouteMeta, roleLabel, visibleNavigationGroups } from "@/modules/core/navigation/moduleRegistry";

// App Shell (Fase 7C): sidebar clara + header superior + conteúdo.
// - >= 1280px: sidebar expandida (240px) · 1024–1279px: trilho de ícones (72px) · < 1024px: drawer (botão no header).
// - Navegação filtrada pelas permissões de /api/auth/me (apenas esconde; o backend continua autoridade).
// - Telas públicas (/login, /redefinir-senha) não usam o shell.
// - O conteúdo NÃO é envolvido em um elemento main: cada página já renderiza o próprio (evita landmark duplicado).
// Registro central da navegação: NAVIGATION_GROUPS (e NAVIGATION_MODULES) em moduleRegistry.
type SessionUser = { email: string; name: string | null; roles: string[]; permissions: string[] };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const drawerId = `${useId()}-navigation`;
  const publicAuthPage = pathname === "/login" || pathname === "/redefinir-senha";
  const meta = resolveRouteMeta(pathname);

  useEffect(() => {
    if (publicAuthPage) return;
    fetch("/api/auth/me")
      .then(async (response) => (response.ok ? setUser(await response.json()) : null))
      .catch(() => undefined);
  }, [publicAuthPage]);


  const groups = useMemo(() => visibleNavigationGroups(user?.permissions ?? []), [user]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Título da aba por rota, a partir do registro central (<title> do React 19 é levado ao <head>).
  const documentTitle = <title>{`${meta.title} · Projeta`}</title>;

  if (publicAuthPage) return <>{documentTitle}{children}</>;

  const shellUser = user ? { email: user.email, name: user.name, roleLabel: roleLabel(user.roles?.[0]) } : null;
  const loading = !user;

  return (
    <ShellActionsProvider>
      {documentTitle}
      <div className="min-h-dvh bg-background">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-body focus:font-semibold focus:shadow-elevation-md">
          Pular para o conteúdo
        </a>
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[4.5rem] border-r border-border bg-surface lg:block xl:w-60">
          <SidebarNav groups={groups} pathname={pathname} loading={loading} />
        </aside>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navegação" hideTitle closeLabel="Fechar navegação" className="lg:hidden">
          <div id={drawerId} className="h-full">
            <SidebarNav groups={groups} pathname={pathname} loading={loading} variant="drawer" onNavigate={() => setDrawerOpen(false)} />
          </div>
        </Drawer>
        <div className="lg:pl-[4.5rem] xl:pl-60">
          <AppHeader trail={meta.trail} user={shellUser} onLogout={logout} onOpenMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} drawerId={drawerId} />
          <div id="conteudo" tabIndex={-1} className="app-content outline-none">{children}</div>
        </div>
      </div>
    </ShellActionsProvider>
  );
}
