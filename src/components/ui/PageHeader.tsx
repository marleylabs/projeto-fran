import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import clsx from "clsx";

// Cabeçalho da PÁGINA (dentro do App Shell): é o dono do título visível (h1), da descrição e das ações da página.
// Regra anti-duplicação: o header do shell mostra só o CONTEXTO (trilha de ancestrais: grupo/página-pai) e o
// título da aba; o título da página aparece uma única vez, aqui. Por isso `eyebrow` (que repetia o contexto, ex.:
// "Administração / Acessos") não é mais exibido — a prop continua aceita para não quebrar as telas existentes.
type PageHeaderProps = {
  /** @deprecated O contexto agora aparece no header do App Shell; não é mais renderizado. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Voltar",
  className,
}: PageHeaderProps) {
  return (
    <header className={clsx("flex flex-col gap-3", className)}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-text-muted transition-colors hover:text-primary"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="text-page-title text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-body text-foreground-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
