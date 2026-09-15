"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

/** Cabeçalho padrão de página: breadcrumb opcional + título + descrição curta + ações. */
export function PageHeader({ title, description, backHref, backLabel, actions }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-foreground mb-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {backLabel ?? "Voltar"}
          </Link>
        )}
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{title}</h1>
        {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
