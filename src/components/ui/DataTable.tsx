"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { FeedbackAlert } from "./FeedbackAlert";
import { SkeletonTableRows } from "./Skeleton";

// Tabela de dados do Design System: <table> NATIVA + composição própria (sem TanStack — ele segue só nas duas
// tabelas antigas que já o usam). A tabela NÃO decide dados: ordenação, paginação, filtros e seleção são do consumidor.
// - Semântica: <caption> (sr-only por padrão), <thead>/<tbody>, th scope="col", th scope="row" (coluna rowHeader).
// - Cabeçalho 40px surface-muted 12/600; linhas 44px (36px no modo dense); sem zebra; borda inferior + hover sutil.
// - Números/dinheiro: coluna `numeric` → alinhada à direita com tabular-nums (nunca centralizada).
// - Largura: scroll horizontal SÓ no contêiner (overflow-x-auto); nada de virar cards no mobile.
// - Sticky opcional: cabeçalho (com maxHeight), primeira coluna (sticky: "start") e ações (stickyActions).
//   Células fixas têm fundo opaco e z-index acima das rolantes; scroll-padding evita que o foco fique escondido
//   atrás delas (WCAG 2.4.11).
export type SortDirection = "asc" | "desc";
export type DataTableSort = { key: string; direction: SortDirection };

export type DataTableColumn<Row> = {
  id: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  /** Número/dinheiro: direita + tabular-nums. */
  numeric?: boolean;
  align?: "left" | "center" | "right";
  /** Renderiza a célula como <th scope="row"> (identificador da linha, ex.: nome). */
  rowHeader?: boolean;
  /** Só a PRIMEIRA coluna pode ser fixa à esquerda; exige `width`. */
  sticky?: "start";
  /** Largura CSS (ex.: "14rem"). Obrigatória em coluna sticky. */
  width?: string;
  /** Mostra o controle de ordenação quando a tabela recebe `sort` + `onSortChange`. Chave = id da coluna. */
  sortable?: boolean;
  headerClassName?: string;
  className?: string;
};

export type DataTableSelection<Row> = {
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  /** Nome da linha para o rótulo do checkbox ("Selecionar <nome>"). */
  getRowLabel: (row: Row) => string;
  isRowSelectable?: (row: Row) => boolean;
};

export type DataTableProps<Row> = {
  caption: ReactNode;
  captionVisible?: boolean;
  columns: DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  density?: "default" | "dense";
  loading?: boolean;
  loadingRows?: number;
  error?: ReactNode;
  onRetry?: () => void;
  empty?: { title: string; description?: string; action?: ReactNode; icon?: ReactNode };
  selection?: DataTableSelection<Row>;
  /** Barra de ações em lote (aparece quando há linhas selecionadas). */
  bulkActions?: ReactNode;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  /** Coluna de ações (ex.: FloatingActionMenu). */
  rowActions?: (row: Row) => ReactNode;
  actionsLabel?: string;
  stickyActions?: boolean;
  /** Altura máxima do contêiner (ativa scroll vertical e cabeçalho fixo). */
  maxHeight?: string;
  /** Largura mínima da tabela (ex.: "1200px") — abaixo disso o contêiner rola na horizontal. */
  minWidth?: string;
  /** Rodapé opcional (ex.: <Pagination />) dentro da mesma moldura. */
  footer?: ReactNode;
  className?: string;
};

/** Próxima ordenação ao clicar no cabeçalho: outra coluna começa em "asc"; a mesma alterna asc ⇄ desc. */
export function nextSort(current: DataTableSort | null | undefined, key: string): DataTableSort {
  if (!current || current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

/** Estado do "selecionar todos" considerando só linhas selecionáveis. */
export function selectionState(rowIds: readonly string[], selectedIds: readonly string[]): "none" | "some" | "all" {
  if (!rowIds.length) return "none";
  const selected = new Set(selectedIds);
  const count = rowIds.filter((id) => selected.has(id)).length;
  return count === 0 ? "none" : count === rowIds.length ? "all" : "some";
}

/** Alterna todos os selecionáveis visíveis, preservando seleções de outras páginas. */
export function toggleAllSelection(rowIds: readonly string[], selectedIds: readonly string[]): string[] {
  const visible = new Set(rowIds);
  if (selectionState(rowIds, selectedIds) === "all") return selectedIds.filter((id) => !visible.has(id));
  return [...new Set([...selectedIds, ...rowIds])];
}

const alignClass = (column: { numeric?: boolean; align?: "left" | "center" | "right" }) =>
  column.numeric || column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";

// Fundo das células fixas acompanha hover/seleção da linha (células rolantes passam por baixo).
const stickyCell = "bg-surface group-hover/row:bg-surface-muted group-data-[selected=true]/row:bg-primary-soft";

export function BulkActionBar({ count, onClear, children, className }: { count: number; onClear?: () => void; children?: ReactNode; className?: string }) {
  return (
    <div role="region" aria-label="Ações em lote" className={clsx("flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft px-3 py-2", className)}>
      <p className="text-body font-semibold text-foreground tabular-nums" aria-live="polite">
        {count} {count === 1 ? "selecionado" : "selecionados"}
      </p>
      {onClear && (
        <Button size="sm" variant="ghost" onClick={onClear}><X size={14} aria-hidden="true" />Limpar seleção</Button>
      )}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

function SelectAllCheckbox({ state, onToggle, disabled }: { state: "none" | "some" | "all"; onToggle: () => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return (
    <input ref={ref} type="checkbox" className="checkbox checkbox-sm" checked={state === "all"} onChange={onToggle} disabled={disabled}
      aria-label={state === "all" ? "Desmarcar todas as linhas desta página" : "Selecionar todas as linhas desta página"} />
  );
}

export function DataTable<Row>({
  caption, captionVisible = false, columns, rows, getRowId, density = "default", loading = false, loadingRows = 5,
  error, onRetry, empty, selection, bulkActions, sort, onSortChange, rowActions, actionsLabel = "Ações", stickyActions = false,
  maxHeight, minWidth, footer, className,
}: DataTableProps<Row>) {
  const dense = density === "dense";
  const rowHeight = dense ? "h-9" : "h-11";
  const stickyHeader = Boolean(maxHeight);
  const stickyStart = columns[0]?.sticky === "start" ? columns[0] : undefined;
  const selectableIds = selection ? rows.filter((row) => selection.isRowSelectable?.(row) ?? true).map(getRowId) : [];
  const allState = selection ? selectionState(selectableIds, selection.selectedIds) : "none";
  const selected = new Set(selection?.selectedIds ?? []);
  const columnCount = columns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);
  const showBody = !loading && !error && rows.length > 0;

  // Com seleção + 1ª coluna fixa, o checkbox (2.5rem) também fica fixo à esquerda.
  const selectWidth = "2.75rem";
  const startOffset = selection && stickyStart ? selectWidth : "0px";
  const scrollPadding: CSSProperties = {
    scrollPaddingTop: stickyHeader ? "2.5rem" : undefined,
    scrollPaddingLeft: stickyStart?.width ? `calc(${startOffset} + ${stickyStart.width})` : undefined,
    scrollPaddingRight: stickyActions ? "4rem" : undefined,
  };

  const headCell = clsx("h-10 border-b border-border bg-surface-muted px-3 text-label text-foreground-muted whitespace-nowrap", stickyHeader && "sticky top-0 z-10");
  // Uma linha por registro (densidade previsível); quem precisar quebrar texto usa className "whitespace-normal".
  const bodyCell = clsx(rowHeight, dense ? "py-0.5" : "py-1.5", "whitespace-nowrap border-b border-border px-3 align-middle text-table text-foreground");

  return (
    <div className={clsx("min-w-0 overflow-hidden rounded-card border border-border bg-surface", className)}>
      {selection && bulkActions && selection.selectedIds.length > 0 && (
        <BulkActionBar count={selection.selectedIds.length} onClear={() => selection.onChange([])}>{bulkActions}</BulkActionBar>
      )}
      <div
        className="relative overflow-x-auto overscroll-x-contain"
        style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined, ...scrollPadding }}
        // Contêiner rolável focável para quem navega por teclado (WCAG 2.1.1) quando há scroll.
        tabIndex={0}
        role="region"
        aria-label={typeof caption === "string" ? `${caption} (rolável)` : "Tabela (rolável)"}
      >
        <table className="w-full border-separate border-spacing-0 [&_tbody_tr:last-child>*]:border-b-0" style={{ minWidth }} aria-busy={loading || undefined}>
          <caption className={captionVisible ? "px-3 py-2 text-left text-card-title text-foreground" : "sr-only"}>{caption}</caption>
          <thead>
            <tr>
              {selection && (
                <th scope="col" className={clsx(headCell, "w-11 text-left", stickyStart && "sticky left-0", stickyStart && (stickyHeader ? "z-30" : "z-20"))} style={{ width: selectWidth, minWidth: selectWidth }}>
                  <SelectAllCheckbox state={allState} onToggle={() => selection.onChange(toggleAllSelection(selectableIds, selection.selectedIds))} disabled={loading || !selectableIds.length} />
                </th>
              )}
              {columns.map((column, index) => {
                const sortable = Boolean(column.sortable && onSortChange);
                const active = sort?.key === column.id;
                const SortIcon = !active ? ArrowUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
                const isSticky = index === 0 && column.sticky === "start";
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={sortable ? (active ? (sort?.direction === "asc" ? "ascending" : "descending") : "none") : undefined}
                    className={clsx(headCell, alignClass(column), isSticky && "sticky shadow-[inset_-1px_0_0_var(--color-border)]", isSticky && (stickyHeader ? "z-30" : "z-20"), column.headerClassName)}
                    style={{ width: column.width, minWidth: column.width, left: isSticky ? startOffset : undefined }}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(nextSort(sort, column.id))}
                        className={clsx("-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-sm px-1 hover:text-foreground", column.numeric && "flex-row-reverse", active && "text-foreground")}
                      >
                        {column.header}
                        <SortIcon size={13} aria-hidden="true" className={active ? "text-primary" : "opacity-60"} />
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className={clsx(headCell, "w-16 text-right", stickyActions && "sticky right-0 shadow-[inset_1px_0_0_var(--color-border)]", stickyActions && (stickyHeader ? "z-30" : "z-20"))}>
                  {actionsLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonTableRows columns={columnCount} rows={loadingRows} dense={dense} />}
            {!loading && error && (
              <tr>
                <td colSpan={columnCount} className="p-4">
                  <FeedbackAlert status="error" title="Não foi possível carregar os dados">
                    <div className="grid gap-2">
                      <div>{error}</div>
                      {onRetry && <div><Button size="sm" variant="secondary" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" />Tentar novamente</Button></div>}
                    </div>
                  </FeedbackAlert>
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={columnCount}>
                  <EmptyState title={empty?.title ?? "Nenhum registro encontrado"} description={empty?.description} action={empty?.action} icon={empty?.icon} />
                </td>
              </tr>
            )}
            {showBody && rows.map((row, rowIndex) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);
              const selectable = selection ? (selection.isRowSelectable?.(row) ?? true) : false;
              return (
                <tr key={id} data-selected={isSelected || undefined} className="group/row bg-surface transition-colors hover:bg-surface-muted data-[selected=true]:bg-primary-soft motion-reduce:transition-none">
                  {selection && (
                    <td className={clsx(bodyCell, "w-11", stickyStart && clsx("sticky left-0 z-[2]", stickyCell))} style={{ width: selectWidth, minWidth: selectWidth }}>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={isSelected}
                        disabled={!selectable}
                        onChange={() => selection.onChange(isSelected ? selection.selectedIds.filter((value) => value !== id) : [...selection.selectedIds, id])}
                        aria-label={`Selecionar ${selection.getRowLabel(row)}`}
                      />
                    </td>
                  )}
                  {columns.map((column, index) => {
                    const isSticky = index === 0 && column.sticky === "start";
                    const Cell = column.rowHeader ? "th" : "td";
                    return (
                      <Cell
                        key={column.id}
                        scope={column.rowHeader ? "row" : undefined}
                        className={clsx(
                          bodyCell,
                          alignClass(column),
                          column.numeric && "tabular-nums whitespace-nowrap",
                          column.rowHeader && "font-semibold",
                          isSticky && clsx("sticky z-[2] shadow-[inset_-1px_0_0_var(--color-border)]", stickyCell),
                          column.className,
                        )}
                        style={{ width: column.width, minWidth: column.width, left: isSticky ? startOffset : undefined }}
                      >
                        {column.cell(row, rowIndex)}
                      </Cell>
                    );
                  })}
                  {rowActions && (
                    <td className={clsx(bodyCell, "text-right", stickyActions && clsx("sticky right-0 z-[2] shadow-[inset_1px_0_0_var(--color-border)]", stickyCell))}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t border-border px-3 py-2.5">{footer}</div>}
    </div>
  );
}
