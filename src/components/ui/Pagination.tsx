"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

// Paginação controlada (page 1-based). Não conhece os dados: o consumidor decide se pagina no cliente ou no servidor.
// <nav aria-label> + página atual com aria-current="page"; Anterior/Próxima com nome acessível e desabilitados nas pontas.
export type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

/** Janela de páginas: primeira, última, atual ± `siblings`, com reticências quando há salto. */
export function paginationRange(page: number, pageCount: number, siblings = 1): PaginationItem[] {
  if (pageCount <= 0) return [];
  const current = Math.min(Math.max(1, page), pageCount);
  // primeira + última + atual + vizinhos + 2 reticências
  if (pageCount <= siblings * 2 + 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const start = Math.max(2, current - siblings);
  const end = Math.min(pageCount - 1, current + siblings);
  const items: PaginationItem[] = [1];
  if (start > 2) items.push("ellipsis-start");
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < pageCount - 1) items.push("ellipsis-end");
  items.push(pageCount);
  return items;
}

/** "Mostrando 11–20 de 57" (null quando não há total). */
export function paginationSummary(page: number, pageSize: number, totalItems: number) {
  if (totalItems <= 0) return "Nenhum registro";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(totalItems, page * pageSize);
  const format = (value: number) => value.toLocaleString("pt-BR");
  return `Mostrando ${format(first)}–${format(last)} de ${format(totalItems)}`;
}

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Com totalItems + pageSize mostra "Mostrando X–Y de Z". */
  totalItems?: number;
  pageSize?: number;
  siblings?: number;
  label?: string;
  className?: string;
};

const pageButton =
  "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-control px-2 text-button tabular-nums text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-foreground-muted disabled:opacity-60 disabled:hover:bg-transparent motion-reduce:transition-none";

export function Pagination({ page, pageCount, onPageChange, totalItems, pageSize, siblings = 1, label = "Paginação", className }: PaginationProps) {
  const current = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const items = paginationRange(current, pageCount, siblings);
  const summary = totalItems !== undefined && pageSize ? paginationSummary(current, pageSize, totalItems) : null;
  return (
    <div className={clsx("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      {summary && <p className="text-caption text-foreground-muted tabular-nums" aria-live="polite">{summary}</p>}
      <nav aria-label={label} className="ml-auto">
        <ul className="flex items-center gap-1">
          <li>
            <button type="button" className={pageButton} onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="Página anterior">
              <ChevronLeft size={16} aria-hidden="true" />
              <span className="hidden sm:inline" aria-hidden="true">Anterior</span>
            </button>
          </li>
          {items.map((item) =>
            typeof item === "number" ? (
              <li key={item} className="hidden sm:block">
                <button
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-current={item === current ? "page" : undefined}
                  aria-label={`Página ${item}`}
                  className={clsx(pageButton, item === current && "bg-primary-soft font-semibold text-primary hover:bg-primary-soft")}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li key={item} aria-hidden="true" className="hidden px-1 text-caption text-foreground-muted sm:block">…</li>
            ),
          )}
          {/* Mobile: os números somem; o contexto fica em texto. */}
          <li className="px-2 text-caption text-foreground-muted tabular-nums sm:hidden">Página {current} de {Math.max(1, pageCount)}</li>
          <li>
            <button type="button" className={pageButton} onClick={() => onPageChange(current + 1)} disabled={current >= pageCount} aria-label="Próxima página">
              <span className="hidden sm:inline" aria-hidden="true">Próxima</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
