"use client";

// Índice de Despesas (/pagamentos): um card por seção de despesa, cada uma com regras próprias de origem, cálculo e
// rateio. Só navegação; sem chamadas de API. Para incluir uma nova seção, adicione em expenseSections (e no menu lateral).
import { BusFront, GraduationCap, HeartPulse, UtensilsCrossed } from "lucide-react";
import { ExpenseSectionCard } from "@/components/ExpenseSectionCard";
import { PageHeader } from "@/components/ui";

const expenseSections = [
  { title: "Alimentação", description: "Lotes mensais de MA e PA, cálculo por colaborador e rateio por setor.", icon: UtensilsCrossed, href: "/pagamentos/alimentacao" },
  { title: "Vale Transporte", description: "Mapa de pagamento do MA com valores individuais por colaborador e rateio por departamento.", icon: BusFront, href: "/pagamentos/vale-transporte" },
  { title: "Plano de Saúde", description: "Faturas da operadora em PDF, valor cobrado por titular (com dependentes) e rateio por empresa, centro de custo e departamento.", icon: HeartPulse, href: "/pagamentos/plano-de-saude" },
  { title: "Treinamentos", description: "Controle dos treinamentos realizados, participantes, custos e rateio por setor.", icon: GraduationCap, href: "/pagamentos/treinamentos" },
] as const;

export default function AccountsPayableSectionsPage() {
  return <div className="flex flex-1 flex-col"><main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8"><PageHeader eyebrow="Despesas" title="Seções de despesas e obrigações" description="Cada seção possui suas próprias regras de origem, validação, cálculo e rateio."/><section className="grid gap-4 lg:grid-cols-2" aria-label="Seções de Despesas">{expenseSections.map(section => <ExpenseSectionCard key={section.title} {...section}/>)}</section></main></div>;
}
