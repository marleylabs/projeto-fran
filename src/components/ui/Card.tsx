import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

// Superfície padrão do Design System (Fase 7): fundo surface, borda 1px, raio 12px, sombra sm.
// Não usa a classe daisyUI `.card` (que tem estilo global próprio) para não herdar overrides legados.
type CardPadding = "none" | "sm" | "md" | "lg";
const paddings: Record<CardPadding, string> = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-6 sm:p-8" };

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "aside";
  padding?: CardPadding;
};

export function Card({ as: Tag = "section", padding = "md", className, children, ...props }: CardProps) {
  return (
    <Tag className={clsx("rounded-card border border-border bg-surface text-foreground shadow-elevation-sm", paddings[padding], className)} {...props}>
      {children}
    </Tag>
  );
}

export type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleAs?: "h2" | "h3" | "h4";
  className?: string;
};

export function CardHeader({ title, description, actions, titleAs: Title = "h2", className }: CardHeaderProps) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <Title className="text-card-title text-foreground">{title}</Title>
        {description && <p className="mt-1 text-caption text-foreground-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
