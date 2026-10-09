"use client";

// Ações rápidas da Home: tarefas frequentes (não a sidebar inteira). SÓ APRESENTAÇÃO e sem API: os destinos e a
// visibilidade vêm do moduleRegistry (visibleNavigationGroups) com as permissões do usuário — o backend continua a
// autoridade de cada rota.
import Link from "next/link";
import { ArrowRight, Bus, Calculator, GraduationCap, Users, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { visibleNavigationGroups } from "@/modules/core/navigation/moduleRegistry";

const QUICK_ACTIONS: { navId: string; label: string; description: string; icon: LucideIcon }[] = [
  { navId: "food", label: "Alimentação", description: "Lotes MA/PA, Café da Manhã e Cesta Básica", icon: UtensilsCrossed },
  { navId: "transit-voucher", label: "Vale Transporte", description: "Mapa mensal de passagens", icon: Bus },
  { navId: "training-expenses", label: "Treinamentos realizados", description: "Participantes, valor e rateio por setor", icon: GraduationCap },
  { navId: "payroll", label: "Folha de pagamento", description: "Extrair e conferir o Extrato Mensal", icon: Calculator },
  { navId: "collaborators", label: "Colaboradores", description: "Cadastro mestre e importação", icon: Users },
];

/** Ações permitidas ao usuário (mesma regra de visibilidade da sidebar), na ordem definida acima. */
export function quickActionsFor(permissions: readonly string[]) {
  const items = new Map(visibleNavigationGroups(permissions).flatMap((group) => group.items).filter((item) => item.availability === "available" && item.href).map((item) => [item.id, item.href!]));
  return QUICK_ACTIONS.filter((action) => items.has(action.navId)).map((action) => ({ ...action, href: items.get(action.navId)! }));
}

export function DashboardQuickActions({ permissions }: { permissions: readonly string[] }) {
  const actions = quickActionsFor(permissions);
  if (!actions.length) return null;
  return (
    <Card as="section" aria-labelledby="home-quick-actions" className="grid gap-3">
      <CardHeader title={<span id="home-quick-actions">Ações rápidas</span>} />
      <ul className="grid grid-cols-2 gap-2 xl:grid-cols-5">
        {actions.map(({ navId, label, description, icon: Icon, href }) => (
          <li key={navId}>
            <Link href={href} className="group flex h-full min-h-11 items-start gap-2 rounded-control sm:gap-3 border border-border bg-surface px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-surface-muted motion-reduce:transition-none">
              <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-body font-semibold">{label}</span>
                <span className="hidden text-caption text-foreground-muted sm:block">{description}</span>
              </span>
              <ArrowRight size={16} aria-hidden="true" className="mt-0.5 hidden shrink-0 text-foreground-muted transition-transform sm:block group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
