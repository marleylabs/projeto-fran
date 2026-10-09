"use client";

import Link from "next/link";
import { BookOpen, Building2, Bus, Calculator, GraduationCap, LayoutDashboard, ShieldCheck, Users, UtensilsCrossed, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { ProjetaWordmark } from "@/components/brand/ProjetaWordmark";
import { isNavigationItemActive, type NavigationGroup, type NavigationIconKey } from "@/modules/core/navigation/moduleRegistry";

const ICONS: Record<NavigationIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  food: UtensilsCrossed,
  transit: Bus,
  training: GraduationCap,
  payroll: Calculator,
  entities: Building2,
  collaborators: Users,
  catalog: BookOpen,
  users: ShieldCheck,
};

// Navegação principal. `variant="sidebar"`: expandida a partir de 1280px e em TRILHO de ícones entre 1024 e
// 1279px (rótulo vira texto para leitor de tela + dica visual no hover/foco). `variant="drawer"`: sempre expandida.
// Item ativo: fundo primary-soft + texto/ícone primary + peso + barra lateral + aria-current="page".
export function SidebarNav({ groups, pathname, loading, onNavigate, variant = "sidebar" }: { groups: NavigationGroup[]; pathname: string; loading: boolean; onNavigate?: () => void; variant?: "sidebar" | "drawer" }) {
  const rail = variant === "sidebar";
  return (
    <div className="flex h-full flex-col">
      <div className={clsx("flex h-16 shrink-0 items-center border-b border-border px-5", rail && "lg:max-xl:justify-center lg:max-xl:px-0")}>
        <Link href="/pagamentos" onClick={onNavigate} className="rounded-control" aria-label="Projeta — ir para Despesas">
          <ProjetaWordmark markOnlyAtRail={rail} />
        </Link>
      </div>
      <nav aria-label="Navegação principal" className={clsx("flex-1 overflow-y-auto px-3 py-4", rail && "lg:max-xl:px-2")}>
        {loading ? (
          <ul className="grid gap-2" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <li key={index} className="h-10 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />)}
          </ul>
        ) : (
          <ul className="grid gap-5">
            {groups.map((group) => (
              <li key={group.id}>
                <p className={clsx("px-3 pb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-foreground-muted", rail && "lg:max-xl:sr-only")}>{group.label}</p>
                {rail && <span aria-hidden="true" className="mx-auto mb-2 hidden h-px w-8 bg-border lg:max-xl:block" />}
                <ul className="grid gap-0.5">
                  {group.items.map((item) => {
                    const Icon = ICONS[item.icon];
                    const active = isNavigationItemActive(pathname, item);
                    const base = clsx("group relative flex h-10 items-center gap-3 rounded-control px-3 text-body", rail && "lg:max-xl:justify-center lg:max-xl:px-0");
                    const label = <span className={clsx("truncate", rail && "lg:max-xl:sr-only")}>{item.label}</span>;
                    const tip = rail && <span aria-hidden="true" className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-control bg-neutral-dark px-2.5 py-1.5 text-caption font-semibold text-on-primary shadow-elevation-md lg:max-xl:group-hover:block lg:max-xl:group-focus-visible:block">{item.label}{item.availability === "planned" ? " (em breve)" : ""}</span>;
                    if (item.availability === "planned" || !item.href) {
                      return (
                        <li key={item.id}>
                          <span aria-disabled="true" className={clsx(base, "cursor-not-allowed text-foreground-muted/70")}>
                            <Icon size={18} aria-hidden="true" className="shrink-0" />
                            {label}
                            <span className={clsx("ml-auto rounded-full border border-border px-2 py-0.5 text-caption text-foreground-muted", rail && "lg:max-xl:hidden")}>Em breve</span>
                            {tip}
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={clsx(base, "transition-colors duration-150 motion-reduce:transition-none",
                            active ? "bg-primary-soft font-semibold text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary" : "font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground")}
                        >
                          <Icon size={18} aria-hidden="true" className="shrink-0" />
                          {label}
                          {tip}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
