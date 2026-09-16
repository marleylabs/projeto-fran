import type { ReactNode } from "react";
import clsx from "clsx";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={clsx("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      {icon && <span className="text-text-muted" aria-hidden="true">{icon}</span>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
