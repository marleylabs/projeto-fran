"use client";

// Aba "Resumo" do Café da Manhã: Empresa → Centro de Custo (estrutura gerencial; não é uma perspectiva do Rateio).
// SÓ APRESENTAÇÃO dos totais já agregados por groupBreakfastByCompanyCostCenter (rateio.ts) e da diferença calculada
// na seção. Os indicadores do topo chegam prontos (valores já carregados pela tela).
import { CheckCircle2, CornerDownRight, XCircle } from "lucide-react";
import clsx from "clsx";
import { Card, DataTable, EmptyState, type DataTableColumn } from "@/components/ui";
import { CompetenceSummary, type CompetenceSummaryItem } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import type { groupBreakfastByCompanyCostCenter } from "../rateio";
import { moneyCents } from "./format";

type Summary = ReturnType<typeof groupBreakfastByCompanyCostCenter>;
type SummaryRow = { id: string; kind: "company" | "costCenter"; label: string; people: number; totalCents: number };

export function BreakfastSummaryView({ summary, difference, indicators }: { summary: Summary; difference: number; indicators: CompetenceSummaryItem[] }) {
  if (!summary.companies.length) return <Card><EmptyState title="Nenhum lançamento nesta competência." /></Card>;
  const ok = difference === 0 && summary.consistent;
  const rows: SummaryRow[] = summary.companies.flatMap((company) => [
    { id: `company|${company.company}`, kind: "company" as const, label: company.company, people: company.people, totalCents: company.totalCents },
    ...company.costCenters.map((costCenter) => ({ id: `cc|${company.company}|${costCenter.costCenter}`, kind: "costCenter" as const, label: costCenter.costCenter, people: costCenter.people, totalCents: costCenter.totalCents })),
  ]);
  const columns: DataTableColumn<SummaryRow>[] = [
    { id: "label", header: "Empresa / Centro de Custo", rowHeader: true, sticky: "start", width: "15rem", cell: (row) => row.kind === "company"
      ? <span className="block truncate">{row.label}</span>
      : <span className="flex items-center gap-1.5 pl-4 font-normal text-foreground"><CornerDownRight size={14} aria-hidden="true" className="shrink-0 text-foreground-muted" /><span className="truncate">{row.label}</span></span> },
    { id: "people", header: "Colaboradores", numeric: true, cell: (row) => row.people },
    { id: "total", header: "Total", numeric: true, cell: (row) => (row.kind === "company" ? <strong className="text-primary">{moneyCents(row.totalCents)}</strong> : moneyCents(row.totalCents)) },
  ];
  return (
    <div className="grid gap-4">
      <CompetenceSummary items={indicators} />
      <DataTable
        caption="Resumo por Empresa e Centro de Custo"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        minWidth="480px"
        footer={
          <div className={clsx("flex flex-wrap items-center justify-between gap-2 tabular-nums", ok ? "text-foreground" : "text-danger-text")} role={ok ? undefined : "alert"}>
            <span className="flex items-center gap-1.5 text-caption">
              {ok ? <CheckCircle2 size={14} aria-hidden="true" className="text-success-text" /> : <XCircle size={14} aria-hidden="true" />}
              {ok ? "Colaboradores = centros de custo = empresas = total · diferença R$ 0,00" : `Inconsistência: diferença ${moneyCents(difference)}`}
            </span>
            <span className="flex items-baseline gap-2"><span className="text-label text-foreground-muted">Total Geral</span><strong className="text-section-title">{moneyCents(summary.grandCents)}</strong></span>
          </div>
        }
      />
    </div>
  );
}
