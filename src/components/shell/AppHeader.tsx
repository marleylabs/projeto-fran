"use client";

import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { ProjetaWordmark } from "@/components/brand/ProjetaWordmark";
import type { RouteCrumb } from "@/modules/core/navigation/moduleRegistry";
import { ProfileMenu, type ShellUser } from "./ProfileMenu";
import { useShellActions } from "./ShellActions";

// Header do shell (64px): contexto da rota + ações contextuais + perfil. Sem busca global e sem notificações
// (não existem no backend). A trilha mostra só os ANCESTRAIS da página — o título (h1) é do PageHeader da página,
// para não duplicar "Colaboradores" no header e logo abaixo.
export function AppHeader({ trail, user, onLogout, onOpenMenu, menuOpen, drawerId }: { trail: RouteCrumb[]; user: ShellUser | null; onLogout: () => void; onOpenMenu: () => void; menuOpen: boolean; drawerId: string }) {
  const actions = useShellActions();
  return (
    // NÃO é sticky: várias páginas já têm barras próprias `sticky top-0` (ex.: Colaboradores); um header fixo
    // cobriria essas barras (e o foco nelas). A sidebar continua fixa; o header rola junto com o conteúdo.
    <header className="relative z-20 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        aria-expanded={menuOpen}
        aria-controls={drawerId}
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-control border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted lg:hidden"
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <ProjetaWordmark className="sm:hidden" />
      {trail.length > 0 && (
        <nav aria-label="Localização" className="hidden min-w-0 sm:block">
          <ol className="flex min-w-0 items-center gap-1.5 text-body text-foreground-muted">
            {trail.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="truncate rounded-sm font-medium hover:text-primary">{crumb.label}</Link>
                ) : (
                  <span className="truncate font-medium">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="ml-auto flex items-center gap-2">
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
