import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock, Info, XCircle, type LucideIcon } from "lucide-react";
import clsx from "clsx";

// Status com ÍCONE + TEXTO + COR (nunca só cor). Texto em tons "-text" para contraste AA sobre fundo claro.
export type StatusTone = "neutral" | "pending" | "success" | "warning" | "danger" | "info";

const tones: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  neutral: { className: "border-border bg-surface-muted text-foreground", icon: Circle },
  pending: { className: "border-warning/30 bg-warning-soft text-warning-text", icon: Clock },
  success: { className: "border-success/30 bg-success-soft text-success-text", icon: CheckCircle2 },
  warning: { className: "border-warning/30 bg-warning-soft text-warning-text", icon: AlertTriangle },
  danger: { className: "border-danger/30 bg-danger-soft text-danger-text", icon: XCircle },
  info: { className: "border-info/30 bg-info-soft text-info-text", icon: Info },
};

export type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

export function StatusBadge({ tone = "neutral", children, icon, className }: StatusBadgeProps) {
  const Icon = icon ?? tones[tone].icon;
  return (
    <span className={clsx("inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-caption font-semibold", tones[tone].className, className)}>
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
