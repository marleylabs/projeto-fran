import type { LucideIcon } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Estado vazio reutilizável — evita telas com só uma tabela sem linhas e nenhum contexto. */
export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-12 px-4">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-surface-soft border border-border flex items-center justify-center text-text-subtle">
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-text-muted max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
