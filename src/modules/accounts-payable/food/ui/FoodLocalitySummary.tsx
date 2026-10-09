// Consolidado informativo da Alimentação (MA, PA e MA + PA). SÓ APRESENTAÇÃO: contagens e totais chegam prontos da página
// (lotes prontos da competência). Fase 7H: tokens do Design System e ícones lucide (sem SVG próprio nem cores cruas).
import { Building2, CircleDollarSign, FileText, Users, UtensilsCrossed, type LucideIcon } from "lucide-react";
import clsx from "clsx";

type FoodLocalitySummaryProps = { locality: "MA" | "PA"; suppliers: number; collaborators: number; meals: number; formattedTotal: string };
type FoodInformativeTotalSummaryProps = { obligations: number; collaborators: number; meals: number; formattedTotal: string };
type SummaryMetric = { icon: LucideIcon; title: string; value: string | number; description: string; emphasized?: boolean };

function FoodSummaryStats({ id, badge, title, description, metrics, total = false }: { id: string; badge: string; title: string; description: string; metrics: [SummaryMetric, SummaryMetric, SummaryMetric, SummaryMetric]; total?: boolean }) {
  return (
    <article aria-labelledby={id} className={clsx("min-w-0", total && "rounded-card border border-border-strong bg-surface-muted p-3 sm:p-4")}>
      <header className="mb-2 flex items-center gap-3">
        <span className="inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-caption font-bold text-on-primary">{badge}</span>
        <div className="min-w-0">
          <h3 id={id} className="text-card-title text-foreground">{title}</h3>
          <p className="text-caption text-foreground-muted">{description}</p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.title} className={clsx("flex min-w-0 items-start justify-between gap-3 px-3 py-2.5", metric.emphasized ? "bg-calc-surface" : "bg-surface")}>
            <div className="min-w-0">
              <dt className="truncate text-label text-foreground-muted">{metric.title}</dt>
              <dd className={clsx("mt-0.5 truncate tabular-nums", metric.emphasized ? "text-section-title text-primary" : "text-card-title text-foreground")}>{metric.value}</dd>
              <dd className="text-caption text-foreground-muted">{metric.description}</dd>
            </div>
            <metric.icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-foreground-muted" />
          </div>
        ))}
      </dl>
    </article>
  );
}

export function FoodLocalitySummary({ collaborators, formattedTotal, locality, meals, suppliers }: FoodLocalitySummaryProps) {
  return (
    <FoodSummaryStats
      id={`summary-${locality}`}
      badge={locality}
      title={locality === "MA" ? "Maranhão" : "Pará"}
      description={suppliers > 0 ? "Resumo da competência selecionada" : "Nenhum processamento nesta competência"}
      metrics={[
        { icon: Building2, title: "Fornecedores", value: suppliers, description: "Processado(s)" },
        { icon: Users, title: "Colaboradores", value: collaborators, description: "Colaboradores únicos" },
        { icon: UtensilsCrossed, title: "Refeições", value: meals, description: "Ocorrências válidas" },
        { icon: CircleDollarSign, title: "Valor total", value: formattedTotal, description: "Competência atual", emphasized: true },
      ]}
    />
  );
}

export function FoodInformativeTotalSummary({ collaborators, formattedTotal, meals, obligations }: FoodInformativeTotalSummaryProps) {
  return (
    <FoodSummaryStats
      id="summary-total"
      badge="MA + PA"
      title="TOTAL INFORMATIVO"
      description="Consolidado da competência"
      total
      metrics={[
        { icon: FileText, title: "Obrigações", value: obligations, description: "Obrigações geradas" },
        { icon: Users, title: "Colaboradores", value: collaborators, description: "Colaboradores únicos" },
        { icon: UtensilsCrossed, title: "Refeições", value: meals, description: "Ocorrências válidas" },
        { icon: CircleDollarSign, title: "Valor total", value: formattedTotal, description: "MA + PA", emphasized: true },
      ]}
    />
  );
}
