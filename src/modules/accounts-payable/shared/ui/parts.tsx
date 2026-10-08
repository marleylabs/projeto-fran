"use client";

// Peças visuais pequenas compartilhadas pelas telas de Despesas (sem regra): nota com ícone, dica acessível e seção
// expansível.
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Tooltip } from "@/components/ui";

export type NoteTone = "muted" | "success" | "warning" | "danger" | "info";
const NOTE: Record<NoteTone, { className: string; icon: LucideIcon | null }> = {
  muted: { className: "text-foreground-muted", icon: null },
  success: { className: "text-success-text", icon: CheckCircle2 },
  warning: { className: "text-warning-text", icon: AlertTriangle },
  danger: { className: "text-danger-text font-semibold", icon: XCircle },
  info: { className: "text-info-text", icon: Info },
};

/** Linha secundária (caption) sob um valor. Estados relevantes levam ícone + texto (nunca só cor). */
export function Note({ tone = "muted", children, className }: { tone?: NoteTone; children: ReactNode; className?: string }) {
  const Icon = NOTE[tone].icon;
  return (
    <span className={clsx("mt-0.5 flex items-start gap-1 whitespace-normal text-caption", NOTE[tone].className, className)}>
      {Icon && <Icon size={12} aria-hidden="true" className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </span>
  );
}

/** Ícone de informação focável com Tooltip (substitui title="..." nas informações importantes). */
export function InfoTip({ label, content }: { label: string; content: ReactNode }) {
  return (
    <Tooltip content={content}>
      <button type="button" aria-label={label} className="inline-grid size-6 shrink-0 cursor-help place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground motion-reduce:transition-none">
        <Info size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** Seção expansível nativa (<details>): teclado e leitores de tela sem script. Usada no Rateio. */
export function Disclosure({ title, meta, level = 1, defaultOpen = false, children }: { title: ReactNode; meta?: ReactNode; level?: 1 | 2; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className={clsx("group min-w-0 rounded-control border border-border", level === 1 ? "bg-surface" : "bg-surface-muted/60")}>
      <summary className={clsx("flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control px-3 py-1.5 hover:bg-surface-muted [&::-webkit-details-marker]:hidden", level === 1 ? "min-h-11" : "min-h-10")}>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-foreground-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        <span className={clsx("min-w-[9rem] flex-1 truncate", level === 1 ? "text-card-title" : "text-body font-semibold")}>{title}</span>
        {meta && <span className="ml-auto shrink-0 text-caption text-foreground-muted tabular-nums">{meta}</span>}
      </summary>
      <div className="border-t border-border p-2 sm:p-3">{children}</div>
    </details>
  );
}
