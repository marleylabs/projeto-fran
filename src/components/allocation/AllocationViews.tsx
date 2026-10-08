"use client";

// Apresentação compartilhada das perspectivas de Rateio (Alimentação, Café da Manhã, Cesta Básica). Só exibe: as linhas
// chegam normalizadas e com o valor final (centavos) do módulo; os agrupamentos vêm de buildAllocationTree. A troca de
// perspectiva é local (sem nova requisição). Um módulo pode manter a renderização atual de uma visão (`custom`) e
// detalhar as linhas de colaborador (`renderLeaf`) sem misturar regra de negócio aqui.
import { useId, useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import { Field, textInputClassName } from "@/components/ui";
import { ALLOCATION_VIEWS, buildAllocationTree, type AllocationNode, type AllocationViewId, type AllocationViewRow } from "@/modules/accounts-payable/shared/allocation-views";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const peopleLabel = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;

export type AllocationViewsProps<T> = {
  rows: readonly AllocationViewRow<T>[];
  value: AllocationViewId;
  onValueChange: (value: AllocationViewId) => void;
  /** Perspectivas que o módulo consegue montar com dados históricos; as demais aparecem desabilitadas. */
  available?: readonly AllocationViewId[];
  unavailableReason?: ReactNode;
  /** Renderização própria (já existente) de uma perspectiva. */
  custom?: Partial<Record<AllocationViewId, ReactNode>>;
  /** Linhas de colaborador de um grupo final (padrão: nome + valor). */
  renderLeaf?: (rows: AllocationViewRow<T>[], node: AllocationNode<T>) => ReactNode;
  /** Total esperado (lançamento): divergência vira alerta. */
  expectedCents?: number;
  className?: string;
};

export function AllocationViews<T>({ rows, value, onValueChange, available = ALLOCATION_VIEWS.map((view) => view.id), unavailableReason, custom, renderLeaf, expectedCents, className }: AllocationViewsProps<T>) {
  const tree = useMemo(() => buildAllocationTree(rows, value), [rows, value]);
  const ok = tree.consistent && (expectedCents === undefined || expectedCents === tree.totalCents);
  const blocked = ALLOCATION_VIEWS.some((view) => !available.includes(view.id));
  return (
    <div className={clsx("grid gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Field label="Visualizar por" className="w-full sm:w-72" helper={blocked ? unavailableReason : undefined}>
          {(control) => (
            <select {...control} className={textInputClassName} value={value} onChange={(event) => onValueChange(event.target.value as AllocationViewId)}>
              {ALLOCATION_VIEWS.map((view) => <option key={view.id} value={view.id} disabled={!available.includes(view.id)}>{view.label}{available.includes(view.id) ? "" : " (indisponível)"}</option>)}
            </select>
          )}
        </Field>
        <p className="text-caption text-foreground-muted tabular-nums">{peopleLabel(tree.people)} · <strong className="text-foreground">{money(tree.totalCents)}</strong></p>
      </div>
      {custom?.[value] ?? (
        <ul className="grid gap-2" aria-label={`Rateio por ${ALLOCATION_VIEWS.find((view) => view.id === value)?.label}`}>
          {tree.nodes.map((node) => <TreeNode key={node.key} node={node} depth={0} renderLeaf={renderLeaf} />)}
        </ul>
      )}
      {!ok && <p role="alert" className="text-caption font-semibold text-danger-text">Inconsistência: a soma da visão ({money(tree.totalCents)}) não fecha com o lançamento{expectedCents !== undefined ? ` (${money(expectedCents)})` : ""}.</p>}
    </div>
  );
}

function TreeNode<T>({ node, depth, renderLeaf }: { node: AllocationNode<T>; depth: number; renderLeaf?: (rows: AllocationViewRow<T>[], node: AllocationNode<T>) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-allocation-node`;
  return (
    <li className={clsx("min-w-0 rounded-control border border-border", depth === 0 ? "bg-surface" : "bg-surface-muted/60")}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((current) => !current)} className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-control px-2 text-left hover:bg-surface-muted sm:px-3">
        <ChevronRight size={16} aria-hidden="true" className={clsx("shrink-0 text-foreground-muted transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        <span className={clsx("min-w-0 flex-1 truncate", depth === 0 ? "text-card-title" : "text-body font-semibold")}>{node.label}</span>
        <span className="shrink-0 text-right text-caption text-foreground-muted tabular-nums">
          <span className="hidden sm:inline">{peopleLabel(node.people)} · </span>
          <strong className="text-body text-foreground">{money(node.cents)}</strong>
        </span>
      </button>
      {/* Painel sempre no DOM (aria-controls válido); oculto enquanto recolhido. */}
      <div id={panelId} hidden={!open} className="border-t border-border p-1.5 pl-2 sm:p-2 sm:pl-4">
          {node.children.length ? (
            <ul className="grid gap-1.5">{node.children.map((child) => <TreeNode key={child.key} node={child} depth={depth + 1} renderLeaf={renderLeaf} />)}</ul>
          ) : renderLeaf ? renderLeaf(node.rows, node) : (
            <ul className="divide-y divide-border">
              {node.rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-1 py-1.5 text-body">
                  <span className="min-w-0 truncate">{row.employeeName}</span>
                  <span className="shrink-0 tabular-nums">{money(row.cents)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </li>
  );
}
