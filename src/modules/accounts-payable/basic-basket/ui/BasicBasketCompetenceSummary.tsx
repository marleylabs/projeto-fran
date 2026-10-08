// Faixa compacta da competência: só exibe dados que a tela já carregou (contexto do servidor + prévia local).
// Deixa explícito que os DIAS DO CALENDÁRIO (28–31) não são o denominador: a base financeira da Cesta é fixa.
import type { ReactNode } from "react";
import clsx from "clsx";

export type CompetenceSummaryItem = { label: string; value: ReactNode; helper?: ReactNode; emphasis?: boolean };

export function BasicBasketCompetenceSummary({ items, className }: { items: CompetenceSummaryItem[]; className?: string }) {
  return (
    <dl className={clsx("grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border sm:grid-cols-3 xl:grid-cols-6", className)}>
      {items.map((item) => (
        <div key={item.label} className={clsx("min-w-0 px-3 py-2.5", item.emphasis ? "bg-calc-surface" : "bg-surface")}>
          <dt className="truncate text-label text-foreground-muted">{item.label}</dt>
          <dd className={clsx("mt-0.5 truncate tabular-nums text-foreground", item.emphasis ? "text-section-title" : "text-card-title")}>{item.value}</dd>
          {item.helper && <dd className="mt-0.5 text-caption text-foreground-muted">{item.helper}</dd>}
        </div>
      ))}
    </dl>
  );
}
