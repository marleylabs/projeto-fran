import type { HTMLAttributes } from "react";
import clsx from "clsx";

// Selo simples (só texto + cor) para rótulos curtos. Para STATUS de processo use StatusBadge, que também mostra
// ícone (cor nunca é a única informação).

/** Tons disponíveis do Badge; cada um mapeia para classes de fundo/texto/borda em `tones`. */
export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "error" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const tones: Record<BadgeTone, string> = {
  neutral: "bg-base-200 text-neutral-medium border-border",
  primary: "bg-primary-soft text-primary-hover border-primary/20",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  error: "bg-error/10 text-error border-error/25",
  info: "bg-info-soft text-info border-info/25",
};

/** Selo arredondado. Repassa qualquer atributo de <span> (title, aria-*, etc.); `className` complementa o tom. */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
