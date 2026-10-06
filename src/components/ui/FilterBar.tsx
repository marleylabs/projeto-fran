"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";

// Padrão ÚNICO de barra de filtros. Os campos e as regras de filtragem continuam no módulo; aqui só a estrutura:
//   [busca] [até ~4 filtros inline] [Filtros avançados (n)] [Limpar filtros] ........ [ações]
// - Quebra de linha (flex-wrap) em telas estreitas: nunca cria scroll horizontal na página.
// - Mais de ~4 filtros: o excedente vai para `advanced` (Dialog no desktop por padrão, ou Drawer).
// - "Limpar filtros" só aparece com `onClear`; fica desabilitado quando `activeCount` é 0.
// Compatível com o uso anterior (<FilterBar actions>{campos}</FilterBar>).
export type FilterBarProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Normalmente um <SearchInput />. Ganha mais espaço que os demais filtros. */
  search?: ReactNode;
  /** Filtros inline (selects, datas, status). Cada filho ocupa uma coluna de grade (mín. 12rem). */
  children?: ReactNode;
  /** Ações à direita (ex.: Exportar, Importar). */
  actions?: ReactNode;
  onClear?: () => void;
  /** Quantidade de filtros ativos (busca inclusa, se o módulo quiser). Mostrada no botão de filtros avançados. */
  activeCount?: number;
  advanced?: {
    content: ReactNode;
    title?: string;
    /** Chamado ao confirmar no painel. Se omitido, os campos do painel aplicam ao mudar (painel só agrupa). */
    onApply?: () => void;
    /** Quantos dos filtros ativos estão dentro do painel (badge do botão). */
    activeCount?: number;
    mode?: "dialog" | "drawer";
  };
  label?: string;
};

export function FilterBar({ search, children, actions, onClear, activeCount, advanced, label = "Filtros", className, ...props }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const panelTitle = advanced?.title ?? "Filtros avançados";
  const advancedCount = advanced?.activeCount ?? 0;
  const close = () => setOpen(false);
  const footer = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={close}>{advanced?.onApply ? "Cancelar" : "Fechar"}</Button>
      {advanced?.onApply && <Button onClick={() => { advanced.onApply?.(); close(); }}>Aplicar filtros</Button>}
    </div>
  );

  return (
    <section
      aria-label={label}
      className={clsx("rounded-card border border-border bg-surface p-3 shadow-elevation-sm sm:p-4", className)}
      {...props}
    >
      <div className="flex flex-wrap items-end gap-3">
        {search && <div className="min-w-0 flex-[2_1_16rem]">{search}</div>}
        {/* Grade auto-fill: colunas de largura igual (mín. 12rem) que quebram de linha; um filtro que sobra sozinho
            na última linha mantém a largura de coluna em vez de esticar até a borda. */}
        {children && <div className="grid min-w-0 flex-[999_1_24rem] grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] items-end gap-3 [&>*]:min-w-0">{children}</div>}
        {(advanced || onClear) && (
          <div className="flex flex-wrap items-center gap-2">
            {advanced && (
              <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
                <SlidersHorizontal size={16} aria-hidden="true" />
                {panelTitle}
                {advancedCount > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-caption font-bold text-surface tabular-nums">
                    {advancedCount}
                    <span className="sr-only"> {advancedCount === 1 ? "filtro ativo" : "filtros ativos"}</span>
                  </span>
                )}
              </Button>
            )}
            {onClear && (
              <Button variant="ghost" onClick={onClear} disabled={activeCount === 0}>
                <X size={16} aria-hidden="true" />
                Limpar filtros
              </Button>
            )}
          </div>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      {advanced && (advanced.mode === "drawer" ? (
        <Drawer open={open} onClose={close} title={panelTitle} side="right" closeLabel="Fechar filtros">
          <div className="grid h-full grid-rows-[1fr_auto] gap-4">
            <div className="grid content-start gap-4">{advanced.content}</div>
            {footer}
          </div>
        </Drawer>
      ) : (
        <Dialog open={open} onClose={close} title={panelTitle} footer={footer} size="md" closeLabel="Fechar filtros">
          <div className="grid gap-4 sm:grid-cols-2">{advanced.content}</div>
        </Dialog>
      ))}
    </section>
  );
}
