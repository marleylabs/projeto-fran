import clsx from "clsx";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  neutral: "bg-surface-soft text-text-muted border border-border",
};

interface Props {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

/** Pill de status reutilizável (Processado / Erro / Pendente / Experimental etc.). */
export function Badge({ variant = "neutral", children }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        VARIANT_STYLES[variant]
      )}
    >
      {children}
    </span>
  );
}
