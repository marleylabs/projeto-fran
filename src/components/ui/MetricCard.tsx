import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  description?: string;
  icon?: LucideIcon;
  accent?: boolean;
}

/** Card de indicador reutilizável: label pequeno, número grande em destaque, ícone discreto. */
export function MetricCard({ label, value, description, icon: Icon, accent }: Props) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide truncate">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-text-subtle shrink-0" strokeWidth={1.75} />}
      </div>
      <span
        className={clsx(
          "text-2xl font-bold truncate leading-tight",
          accent ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </span>
      {description && <span className="text-xs text-text-muted truncate">{description}</span>}
    </div>
  );
}
