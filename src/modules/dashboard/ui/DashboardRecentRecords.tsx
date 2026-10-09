"use client";

// Obrigações registradas mais recentemente (GET /api/financial-records?pageSize=5, ordem do servidor: createdAt desc).
// SÓ APRESENTAÇÃO dos campos reais. A situação exibida é apenas o ciclo de vida (lifecycleState); os demais estados do
// FinancialRecord são independentes e NÃO são resumidos em "pendente/ok".
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, DataTable, StatusBadge, buttonClassName, type DataTableColumn, type StatusTone } from "@/components/ui";

export type RecentFinancialRecord = {
  id: string;
  identifier: string;
  grossAmount: string;
  competenceDate: string | null;
  createdAt: string;
  lifecycleState: "ACTIVE" | "CANCELLED" | "ARCHIVED" | string;
  administrativeEntity: { tradeName: string | null; legalName: string } | null;
};

const LIFECYCLE: Record<string, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Ativa", tone: "info" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  ARCHIVED: { label: "Arquivada", tone: "neutral" },
};

const money = (value: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
// Competência é data-only no servidor: lida em UTC para não deslocar o mês.
const competence = (iso: string | null) => (iso ? `${String(new Date(iso).getUTCMonth() + 1).padStart(2, "0")}/${new Date(iso).getUTCFullYear()}` : null);
const registered = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function DashboardRecentRecords({ rows, loading, error }: { rows: RecentFinancialRecord[]; loading: boolean; error: string | null }) {
  const columns: DataTableColumn<RecentFinancialRecord>[] = [
    { id: "identifier", header: "Obrigação", rowHeader: true, cell: (r) => <Link href={`/pagamentos/${r.id}`} className="font-semibold text-primary underline-offset-2 hover:underline tabular-nums">{r.identifier}</Link> },
    { id: "entity", header: "Entidade", wrap: true, cell: (r) => r.administrativeEntity?.tradeName || r.administrativeEntity?.legalName || <span className="text-foreground-muted">Não informada</span> },
    { id: "competence", header: "Competência", cell: (r) => competence(r.competenceDate) ?? <span className="text-foreground-muted">Não informada</span> },
    { id: "amount", header: "Valor bruto", numeric: true, cell: (r) => money(r.grossAmount) },
    { id: "lifecycle", header: "Situação", cell: (r) => { const state = LIFECYCLE[r.lifecycleState] ?? { label: r.lifecycleState, tone: "neutral" as StatusTone }; return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>; } },
    { id: "created", header: "Registrada em", wrap: true, cell: (r) => <span className="tabular-nums text-foreground-muted">{registered(r.createdAt)}</span> },
  ];
  return (
    <Card as="section" aria-labelledby="home-recent-records" className="grid min-w-0 gap-3">
      <CardHeader
        title={<span id="home-recent-records">Obrigações recentes</span>}
        description="As 5 últimas registradas, em qualquer situação."
        actions={<Link href="/pagamentos" className={buttonClassName({ variant: "ghost", size: "sm" })}>Despesas<ArrowRight size={14} aria-hidden="true" /></Link>}
      />
      <DataTable
        caption="Últimas obrigações registradas"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        density="dense"
        minWidth="600px"
        loading={loading}
        loadingRows={5}
        error={error ?? undefined}
        empty={{ title: "Nenhuma obrigação registrada", description: "As obrigações geradas pelos lançamentos de despesas aparecem aqui." }}
      />
    </Card>
  );
}
