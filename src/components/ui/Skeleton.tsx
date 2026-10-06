import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

// Placeholder de carregamento. Pulso suave (opacidade) e SEM animação com prefers-reduced-motion.
// Sempre decorativo (aria-hidden): quem carrega anuncia o estado (aria-busy + texto sr-only) — ver SkeletonGroup.
type SkeletonVariant = "text" | "block" | "circle";
const variants: Record<SkeletonVariant, string> = {
  text: "h-3 w-full rounded-sm",
  block: "h-10 w-full rounded-control",
  circle: "size-9 rounded-full",
};

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & { variant?: SkeletonVariant };

export function Skeleton({ variant = "text", className, ...props }: SkeletonProps) {
  return <span aria-hidden="true" className={clsx("block animate-pulse bg-border/70 motion-reduce:animate-none", variants[variant], className)} {...props} />;
}

/** Contêiner de carregamento com anúncio para leitores de tela. */
export function SkeletonGroup({ label = "Carregando…", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Card de carregamento (título + linhas), na mesma superfície do Card. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={clsx("grid gap-3 rounded-card border border-border bg-surface p-4 sm:p-5", className)}>
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={index === lines - 1 ? "w-3/5" : undefined} />)}
    </div>
  );
}

// Larguras variadas para não parecer uma grade rígida (determinístico: mesma saída no servidor e no cliente).
const ROW_WIDTHS = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"];

/** Linhas <tr> de carregamento para o <tbody> de uma tabela (mesma altura das linhas reais). */
export function SkeletonTableRows({ columns, rows = 5, dense = false }: { columns: number; rows?: number; dense?: boolean }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className={clsx("border-b border-border px-3", dense ? "h-9" : "h-11")}>
              <Skeleton className={ROW_WIDTHS[(row + column) % ROW_WIDTHS.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
