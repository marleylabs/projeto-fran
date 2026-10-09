import type { ReactNode } from "react";
import { Calculator } from "lucide-react";
import clsx from "clsx";
import { StatusBadge, type StatusTone } from "./StatusBadge";

// Valor CALCULADO pelo sistema (ex.: total, retroativo): superfície calc-surface, sem borda de input, sem foco e sem
// cursor de texto — não pode parecer um campo editável. O valor chega pronto (formatado) do consumidor: este
// componente não calcula nem arredonda nada. `live` anuncia mudanças (ex.: recálculo após editar uma quantidade).
export type CalculatedValueProps = {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  status?: { tone: StatusTone; label: ReactNode };
  size?: "md" | "lg";
  live?: boolean;
  className?: string;
};

export function CalculatedValue({ label, value, helper, status, size = "md", live = false, className }: CalculatedValueProps) {
  return (
    <dl className={clsx("grid gap-1 rounded-control bg-calc-surface px-3 py-2.5", className)}>
      <dt className="flex items-center justify-between gap-2 text-label text-foreground-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Calculator size={14} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{label}</span>
          <span className="sr-only"> (calculado)</span>
        </span>
        {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      </dt>
      <dd aria-live={live ? "polite" : undefined} className={clsx("font-semibold tabular-nums text-foreground", size === "lg" ? "text-section-title" : "text-card-title")}>
        {value}
      </dd>
      {helper && <dd className="text-caption text-foreground-muted">{helper}</dd>}
    </dl>
  );
}
