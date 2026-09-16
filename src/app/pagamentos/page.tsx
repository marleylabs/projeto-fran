"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusFront, PackagePlus, UtensilsCrossed } from "lucide-react";
import { CorporateHeader } from "@/components/CorporateHeader";
import { ExpenseSectionCard } from "@/components/ExpenseSectionCard";
import { PageHeader } from "@/components/ui";

const expenseSections = [
  { title: "Alimentação", description: "Lotes mensais de MA e PA, cálculo por colaborador e rateio por setor.", icon: UtensilsCrossed, href: "/pagamentos/alimentacao" },
  { title: "Vale Transporte", description: "Mapa de pagamento do MA com valores individuais por colaborador e rateio por departamento.", icon: BusFront, href: "/pagamentos/vale-transporte" },
  { title: "Novas seções", description: "A arquitetura está preparada para inclusão de novas regras de despesas.", icon: PackagePlus, disabled: true },
] as const;

export default function AccountsPayableSectionsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { fetch("/api/auth/me").then(response => response.json()).then(me => setEmail(me.email ?? null)).catch(() => undefined); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  return <div className="flex flex-1 flex-col"><CorporateHeader currentUserEmail={email} onLogout={logout}/><main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8"><PageHeader eyebrow="Contas a pagar" title="Seções de despesas e obrigações" description="Cada seção possui suas próprias regras de origem, validação, cálculo e rateio."/><section className="grid gap-4 lg:grid-cols-2" aria-label="Seções de Contas a Pagar">{expenseSections.map(section => <ExpenseSectionCard key={section.title} {...section}/>)}</section></main></div>;
}
