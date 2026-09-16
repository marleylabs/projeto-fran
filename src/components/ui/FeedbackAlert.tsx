import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type FeedbackStatus = "success" | "warning" | "error" | "info";

type FeedbackAlertProps = HTMLAttributes<HTMLDivElement> & {
  status: FeedbackStatus;
  title?: string;
  icon?: ReactNode;
};

const statusClasses: Record<FeedbackStatus, string> = {
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
  info: "alert-info",
};

const defaultIcons: Record<FeedbackStatus, string> = {
  success: "✓",
  warning: "!",
  error: "×",
  info: "i",
};

export function FeedbackAlert({
  children,
  className,
  icon,
  status,
  title,
  ...props
}: FeedbackAlertProps) {
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={clsx("alert items-start", statusClasses[status], className)}
      {...props}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border font-bold" aria-hidden="true">
        {icon ?? defaultIcons[status]}
      </span>
      <div>
        {title && <h3 className="font-semibold">{title}</h3>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
