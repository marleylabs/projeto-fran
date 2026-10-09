import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import clsx from "clsx";

type FeedbackStatus = "success" | "warning" | "error" | "info";

type FeedbackAlertProps = HTMLAttributes<HTMLDivElement> & {
  status: FeedbackStatus;
  title?: string;
  icon?: ReactNode;
};

// Mensagem de feedback com ÍCONE + TÍTULO + TEXTO (não depende só de cor). Ícones lucide (sem glifos Unicode).
const statusClasses: Record<FeedbackStatus, string> = {
  success: "border-success/30 bg-success-soft text-success-text",
  warning: "border-warning/30 bg-warning-soft text-warning-text",
  error: "border-danger/30 bg-danger-soft text-danger-text",
  info: "border-info/30 bg-info-soft text-info-text",
};

const defaultIcons: Record<FeedbackStatus, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

export function FeedbackAlert({
  children,
  className,
  icon,
  status,
  title,
  ...props
}: FeedbackAlertProps) {
  const Icon = defaultIcons[status];
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={clsx("flex items-start gap-3 rounded-control border px-3.5 py-3 text-body", statusClasses[status], className)}
      {...props}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon ?? <Icon size={18} />}
      </span>
      <div className="min-w-0">
        {title && <h3 className="text-card-title">{title}</h3>}
        <div className={clsx("text-foreground", title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}
