"use client";

// Resumo da competência (indicadores e valores por fornecedor/treinamento/departamento). SÓ APRESENTAÇÃO.
import { Card, CardHeader, DataTable } from "@/components/ui";
import { money } from "@/modules/trainings/ui/format";
import type { SummaryData } from "./types";

type Line = { label: string; amount: string };

function SummaryTable({ title, rows }: { title: string; rows: Line[] }) {
  return (
    <Card className="grid min-w-0 gap-3">
      <CardHeader title={title} titleAs="h3" />
      <DataTable
        caption={title}
        columns={[{ id: "label", header: "Item", rowHeader: true, wrap: true, cell: (row) => row.label }, { id: "amount", header: "Valor", numeric: true, cell: (row) => money(row.amount) }]}
        rows={rows}
        getRowId={(row) => row.label}
        density="dense"
        empty={{ title: "Sem dados nesta competência" }}
      />
    </Card>
  );
}

export function TrainingSummaryPanel({ data }: { data: SummaryData }) {
  const indicators: [string, string, boolean?][] = [
    ["Treinamentos realizados", String(data.trainingsRealized)],
    ["Participantes únicos", String(data.uniqueParticipants)],
    ["Participações", String(data.participations)],
    ["Fornecedores", String(data.suppliers)],
    ["Valor total", money(data.valueTotal), true],
  ];
  return (
    <div className="grid gap-4">
      <dl aria-label="Indicadores da competência" className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3 xl:grid-cols-5">
        {indicators.map(([label, value, accent]) => <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5 bg-surface px-4 py-3 last:col-span-2 sm:last:col-span-1"><dt className="text-caption text-foreground-muted">{label}</dt><dd className={accent ? "text-card-title text-primary tabular-nums" : "text-card-title tabular-nums"}>{value}</dd></div>)}
      </dl>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryTable title="Valor por fornecedor" rows={data.bySupplier} />
        <SummaryTable title="Valor por treinamento" rows={data.byTraining} />
        <SummaryTable title="Valor por departamento" rows={data.byDepartment} />
      </div>
    </div>
  );
}
