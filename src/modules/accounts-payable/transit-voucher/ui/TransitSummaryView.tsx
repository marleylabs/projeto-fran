"use client";

// Aba "Resumo" do Vale Transporte: Empresa → Departamento (estrutura gerencial que já existia; não é uma perspectiva do
// Rateio). SÓ APRESENTAÇÃO dos grupos e totais já agregados na página e da diferença calculada lá.
import { CheckCircle2, CornerDownRight, XCircle } from "lucide-react";
import clsx from "clsx";
import { Card, DataTable, EmptyState, type DataTableColumn } from "@/components/ui";
import { CompetenceSummary, type CompetenceSummaryItem } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import { moneyCents } from "./format";

export type TransitSummaryGroup = { company: string; totalCents: number; departments: Array<{ department: string; records: number; totalCents: number }> };
type SummaryRow = { id: string; kind: "company" | "department"; label: string; records: number | null; totalCents: number };

export function TransitSummaryView({ groups, grandCents, difference, indicators }: { groups: TransitSummaryGroup[]; grandCents: number; difference: number; indicators: CompetenceSummaryItem[] }) {
  if (!groups.length) return <Card><EmptyState title="Nenhum lançamento nesta competência." /></Card>;
  const ok = difference === 0;
  const rows: SummaryRow[] = groups.flatMap((group) => [
    { id: `company|${group.company}`, kind: "company" as const, label: group.company, records: null, totalCents: group.totalCents },
    ...group.departments.map((department) => ({ id: `dept|${group.company}|${department.department}`, kind: "department" as const, label: department.department, records: department.records, totalCents: department.totalCents })),
  ]);
  const columns: DataTableColumn<SummaryRow>[] = [
    { id: "label", header: "Empresa / Departamento", rowHeader: true, sticky: "start", width: "15rem", cell: (row) => row.kind === "company"
      ? <span className="block truncate">{row.label}</span>
      : <span className="flex items-center gap-1.5 pl-4 font-normal text-foreground"><CornerDownRight size={14} aria-hidden="true" className="shrink-0 text-foreground-muted" /><span className="truncate">{row.label}</span></span> },
    { id: "records", header: "Registros", numeric: true, cell: (row) => row.records ?? "" },
    { id: "total", header: "Total", numeric: true, cell: (row) => (row.kind === "company" ? <strong className="text-primary">{moneyCents(row.totalCents)}</strong> : moneyCents(row.totalCents)) },
  ];
  return (
    <div className="grid gap-4">
      <CompetenceSummary className="xl:grid-cols-5" items={indicators} />
      <DataTable
        caption="Resumo por Empresa e Departamento"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        minWidth="480px"
        footer={
          <div className={clsx("flex flex-wrap items-center justify-between gap-2 tabular-nums", ok ? "text-foreground" : "text-danger-text")} role={ok ? undefined : "alert"}>
            <span className="flex items-center gap-1.5 text-caption">
              {ok ? <CheckCircle2 size={14} aria-hidden="true" className="text-success-text" /> : <XCircle size={14} aria-hidden="true" />}
              {ok ? "Colaboradores = departamentos = empresas = total · diferença R$ 0,00" : `Inconsistência: diferença ${moneyCents(difference)}`}
            </span>
            <span className="flex items-baseline gap-2"><span className="text-label text-foreground-muted">Total Geral</span><strong className="text-section-title">{moneyCents(grandCents)}</strong></span>
          </div>
        }
      />
    </div>
  );
}
