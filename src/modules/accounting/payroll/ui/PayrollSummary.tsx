"use client";

// Contexto da extração (empresa, competência/período, leitura, formato) e totais. SÓ APRESENTAÇÃO: os totais chegam
// prontos (totaisGerais / totais da extração); nada é recalculado aqui.
import type { ReactNode } from "react";
import { Disclosure } from "@/modules/accounts-payable/shared/ui/parts";
import { FeedbackAlert, StatusBadge } from "@/components/ui";
import type { TotaisGerais } from "@/lib/types/payroll";
import type { SinteticoTotais } from "@/lib/types/sintetico";
import { brl } from "./format";

export function PayrollContext({ items, format }: { items: [string, ReactNode][]; format: string }) {
  return (
    <section aria-label="Contexto da extração" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-border bg-surface px-4 py-3">
      <StatusBadge tone="info">{format}</StatusBadge>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-body">
        {items.map(([label, value]) => <div key={label} className="flex min-w-0 gap-1.5"><dt className="text-foreground-muted">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}
      </dl>
    </section>
  );
}

function Totals({ label, items }: { label: string; items: [string, string, boolean?][] }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4">
      {items.map(([name, value, accent]) => (
        <div key={name} className="flex min-w-0 flex-col-reverse gap-0.5 bg-surface px-4 py-3">
          <dt className="text-caption text-foreground-muted">{name}</dt>
          <dd className={accent ? "truncate text-card-title text-primary tabular-nums" : "truncate text-card-title tabular-nums"}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExtratoTotals({ totais }: { totais: TotaisGerais }) {
  return <Totals label="Totais do Extrato Mensal" items={[
    ["Colaboradores", String(totais.totalColaboradores), true],
    ["Total Proventos", brl(totais.totalProventos)],
    ["Total Descontos", brl(totais.totalDescontos)],
    ["Líquido Geral", brl(totais.liquidoGeral), true],
    ["Total FGTS", brl(totais.totalFGTS)],
    ["Total INSS", brl(totais.totalINSS)],
    ["Total IRRF", brl(totais.totalIRRF)],
    ["Total H.E", brl(totais.totalHE)],
  ]} />;
}

export function SinteticoTotals({ totais }: { totais: SinteticoTotais }) {
  return <Totals label="Totais do Relatório Sintético" items={[
    ["Colaboradores", String(totais.totalColaboradores), true],
    ["Total Salário", brl(totais.totalSalario)],
    ["Total H.E", brl(totais.totalHE)],
    ["Total Proventos", brl(totais.totalProventos)],
    ["Líquido Geral", brl(totais.liquidoGeral), true],
    ["Total INSS", brl(totais.totalINSS)],
    ["Total VT", brl(totais.totalVT)],
    ["Total IR", brl(totais.totalIR)],
  ]} />;
}

/** Avisos de leitura do parser (revisar antes de exportar). Fica visível — não depende de toast. */
export function ReadingNotices({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  return (
    <FeedbackAlert status="warning" title={`${avisos.length} aviso(s) de leitura · revisar antes de exportar`}>
      <Disclosure title="Ver avisos" level={2}>
        <ul className="grid list-inside list-disc gap-1 text-body">{avisos.map((aviso, index) => <li key={index}>{aviso}</li>)}</ul>
      </Disclosure>
    </FeedbackAlert>
  );
}
