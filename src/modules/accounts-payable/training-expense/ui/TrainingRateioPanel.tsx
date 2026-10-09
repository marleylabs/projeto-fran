"use client";

// Rateio de treinamento por fornecedor → departamento → participantes (sistema próprio, sem Empresa/4 perspectivas).
// SÓ APRESENTAÇÃO: os valores e a diferença vêm do servidor; ações (editar rateio, download XLSX) chegam por props.
import type { ReactNode } from "react";
import { Card, DataTable, FeedbackAlert, StatusBadge, type DataTableColumn } from "@/components/ui";
import { Disclosure } from "@/modules/accounts-payable/shared/ui/parts";
import { dateBr, money } from "@/modules/trainings/ui/format";
import type { RateioCardData, RateioRowData } from "./types";

const toCents = (value: string) => Math.round(Number(String(value).replace(",", ".")) * 100);

/** Valor total × rateado × diferença; diferença ≠ 0 é destacada como inconsistência (role=alert). */
export function RateioTotals({ total, allocated, difference, label = "Totais" }: { total: string; allocated: string; difference: string; label?: string }) {
  const items: [string, string][] = [["Valor total", money(total)], ["Rateado", money(allocated)], ["Diferença", money(difference)]];
  const content = <dl aria-label={label} className="flex flex-wrap gap-x-6 gap-y-1 text-body">{items.map(([name, value]) => <div key={name} className="flex gap-1.5"><dt className="text-foreground-muted">{name}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>;
  if (toCents(difference) !== 0) return <FeedbackAlert status="error" title="Inconsistência no rateio">{content}</FeedbackAlert>;
  return <div className="rounded-control border border-border bg-surface-muted/60 px-3 py-2">{content}</div>;
}

const rowColumns: DataTableColumn<RateioRowData>[] = [
  { id: "employee", header: "Colaborador", rowHeader: true, wrap: true, cell: (row) => row.employeeName },
  { id: "training", header: "Treinamento", wrap: true, cell: (row) => row.trainingDescription },
  { id: "date", header: "Data", cell: (row) => <span className="tabular-nums">{dateBr(row.trainingDate)}</span> },
  { id: "costCenter", header: "Centro de custo", wrap: true, cell: (row) => row.costCenter || <span className="text-foreground-muted">Sem centro de custo</span> },
  { id: "amount", header: "Valor", numeric: true, cell: (row) => money(row.amount) },
];

export function TrainingRateioPanel({ card, actions }: { card: RateioCardData; actions?: ReactNode }) {
  const identifiers = card.expenses.map((expense) => expense.financialIdentifier).filter(Boolean) as string[];
  const indicators: [string, ReactNode][] = [
    ["Treinamentos / lançamentos", card.trainings],
    ["Participantes únicos / setores", `${card.uniqueParticipants} / ${card.departments.length}`],
    ["Participações", card.participations],
    ["Valor total · obrigação", `${money(card.totalAmount)}${identifiers.length ? ` · ${identifiers.length === 1 ? identifiers[0] : `${identifiers.length} obrigações`}` : ""}`],
  ];
  return (
    <Card as="article" aria-label={`Rateio ${card.supplierName}`} className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-card-title">{card.supplierName}</h3>
          <p className="text-caption text-foreground-muted">Competência {String(card.competence.month).padStart(2, "0")}/{card.competence.year} · {card.expenses.length} obrigação(ões)</p>
        </div>
        <StatusBadge tone="success">Concluído</StatusBadge>
      </header>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicators.map(([label, value]) => <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5"><dt className="text-caption text-foreground-muted">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <div className="grid gap-2">
        {card.departments.map((department) => (
          <Disclosure
            key={department.department}
            title={department.department}
            meta={`${department.uniqueParticipants} ${department.uniqueParticipants === 1 ? "participante" : "participantes"}${department.participants !== department.uniqueParticipants ? ` · ${department.participants} participações` : ""} · ${money(department.amount)}`}
          >
            <DataTable caption={`Participantes de ${department.department}`} columns={rowColumns} rows={department.rows} getRowId={(row) => row.participantId} density="dense" minWidth="620px" />
          </Disclosure>
        ))}
      </div>
      <RateioTotals total={card.totalAmount} allocated={card.totalAllocated} difference={card.difference} label={`Totais de ${card.supplierName}`} />
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}
