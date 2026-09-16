import type { ReactNode } from "react";
import clsx from "clsx";

type MetricCardProps = {
  label: string;
  value: string;
  description?: string;
  icon?: ReactNode;
  accent?: boolean;
  className?: string;
};

export function MetricCard({ label, value, description, icon, accent, className }: MetricCardProps) {
  return (
    <div className={clsx("card flex min-w-0 flex-col gap-1 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        {icon && <span className="shrink-0 text-text-muted" aria-hidden="true">{icon}</span>}
      </div>
      <span className={clsx("truncate text-2xl font-bold", accent ? "text-primary" : "text-foreground")}>
        {value}
      </span>
      {description && <span className="truncate text-xs text-text-muted">{description}</span>}
    </div>
  );
}
