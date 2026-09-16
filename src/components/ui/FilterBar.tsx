import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type FilterBarProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
};

/**
 * Agrupamento visual de filtros. Os campos e regras continuam específicos de
 * cada módulo; este componente só padroniza o container (empilha no mobile,
 * alinha em linha no desktop) e a área de ações (ex.: "Limpar").
 */
export function FilterBar({ children, actions, className, ...props }: FilterBarProps) {
  return (
    <section className={clsx("card flex flex-col gap-3 p-4", className)} {...props}>
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </section>
  );
}
