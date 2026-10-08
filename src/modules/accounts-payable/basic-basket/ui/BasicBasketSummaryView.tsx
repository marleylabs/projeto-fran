"use client";

// Aba "Resumo" da Cesta Básica: Empresa → Centro de Custo. SÓ APRESENTAÇÃO dos totais já agregados por
// groupBasicBasketByCompanyCostCenter (rateio.ts) e da diferença calculada na seção.
import { CheckCircle2, CornerDownRight, XCircle } from "lucide-react";
import clsx from "clsx";
import { Card, DataTable, EmptyState, type DataTableColumn } from "@/components/ui";
import type { BasicBasketTotals, groupBasicBasketByCompanyCostCenter } from "../rateio";
import { moneyCents } from "./format";
import { BasicBasketCompetenceSummary } from "./BasicBasketCompetenceSummary";

type Summary = ReturnType<typeof groupBasicBasketByCompanyCostCenter>;
type SummaryRow = { id: string; kind: "company" | "costCenter"; label: string; totals: BasicBasketTotals };

// Linha de empresa em negrito; centro de custo em peso normal (hierarquia sem cor extra).
function Amount({ row, cents }: { row: SummaryRow; cents: number }) {
  return row.kind === "company" ? <strong>{moneyCents(cents)}</strong> : <>{moneyCents(cents)}</>;
}

export function BasicBasketSummaryView({ summary, difference }: { summary: Summary; difference: number }) {
  if (!summary.companies.length) return <Card><EmptyState title="Nenhum lançamento nesta competência." /></Card>;
  const ok = difference === 0 && summary.consistent;
  const rows: SummaryRow[] = summary.companies.flatMap((company) => [
    { id: `company|${company.company}`, kind: "company" as const, label: company.company, totals: company.totals },
    ...company.costCenters.map((costCenter) => ({ id: `cc|${company.company}|${costCenter.costCenter}`, kind: "costCenter" as const, label: costCenter.costCenter, totals: costCenter.totals })),
  ]);
  const columns: DataTableColumn<SummaryRow>[] = [
    { id: "label", header: "Empresa / Centro de Custo", rowHeader: true, sticky: "start", width: "18rem", cell: (row) => row.kind === "company"
      ? <span className="block truncate">{row.label}</span>
      : <span className="flex items-center gap-1.5 pl-4 font-normal text-foreground"><CornerDownRight size={14} aria-hidden="true" className="shrink-0 text-foreground-muted" /><span className="truncate">{row.label}</span></span> },
    { id: "people", header: "Colaboradores", numeric: true, cell: (row) => row.totals.people },
    { id: "bonus", header: "Bonificação", numeric: true, cell: (row) => <Amount row={row} cents={row.totals.driverBonusCents} /> },
    { id: "agreement", header: "Acordo", numeric: true, cell: (row) => <Amount row={row} cents={row.totals.agreementCents} /> },
    { id: "basket", header: "Cesta Básica", numeric: true, cell: (row) => <Amount row={row} cents={row.totals.basketCents} /> },
    { id: "retroactive", header: "Retroativo", numeric: true, cell: (row) => <Amount row={row} cents={row.totals.retroactiveCents} /> },
    { id: "total", header: "Total", numeric: true, cell: (row) => <strong className={row.kind === "company" ? "text-primary" : undefined}>{moneyCents(row.totals.totalCents)}</strong> },
  ];
  const t = summary.totals;
  return (
    <div className="grid gap-4">
      <BasicBasketCompetenceSummary items={[
        { label: "Colaboradores", value: t.people },
        { label: "Bonificação", value: moneyCents(t.driverBonusCents) },
        { label: "Acordo", value: moneyCents(t.agreementCents) },
        { label: "Cesta Básica", value: moneyCents(t.basketCents) },
        { label: "Retroativo", value: moneyCents(t.retroactiveCents) },
        { label: "Total Geral", value: moneyCents(t.totalCents), emphasis: true },
      ]} />
      <DataTable
        caption="Resumo por Empresa e Centro de Custo"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        minWidth="900px"
        footer={
          <div className={clsx("flex flex-wrap items-center justify-between gap-2 tabular-nums", ok ? "text-foreground" : "text-danger-text")} role={ok ? undefined : "alert"}>
            <span className="flex items-center gap-1.5 text-caption">
              {ok ? <CheckCircle2 size={14} aria-hidden="true" className="text-success-text" /> : <XCircle size={14} aria-hidden="true" />}
              {ok ? "Colaboradores = centros de custo = empresas = lançamentos · diferença R$ 0,00" : `Inconsistência: diferença ${moneyCents(difference)}`}
            </span>
            <span className="flex items-baseline gap-2"><span className="text-label text-foreground-muted">Total Geral</span><strong className="text-section-title">{moneyCents(t.totalCents)}</strong></span>
          </div>
        }
      />
    </div>
  );
}
