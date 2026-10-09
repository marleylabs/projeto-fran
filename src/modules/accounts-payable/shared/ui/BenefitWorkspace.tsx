"use client";

// Estrutura COMUM dos benefícios de Alimentação, Café da Manhã e Cesta Básica (Fase 7N). Só ESTRUTURA, por composição:
//   cabeçalho da subseção → contexto da competência → abas [Operação] [Rateio] [Histórico].
// Não conhece regra de nenhum módulo: cada um entrega o conteúdo de cada região (slots). Operação fica montada ao trocar
// de aba (keepMounted) para não perder formulário não salvo; Rateio e Histórico montam sob demanda.
import type { ReactNode } from "react";
import { Card, DataTable, EmptyState, Field, SkeletonCard, SkeletonGroup, StatusBadge, TabPanel, Tabs, textInputClassName, type DataTableColumn, type StatusTone } from "@/components/ui";
import { CompetenceSummary, type CompetenceSummaryItem } from "./CompetenceSummary";

export type BenefitTab = "operacao" | "rateio" | "historico";
export const BENEFIT_TABS: { value: BenefitTab; label: string }[] = [
  { value: "operacao", label: "Operação" },
  { value: "rateio", label: "Rateio" },
  { value: "historico", label: "Histórico" },
];

export function BenefitWorkspace({ title, description, context, tab, onTabChange, operation, allocation, history }: {
  title: string;
  description: ReactNode;
  /** Contexto da competência (normalmente <BenefitCompetenceContext />). */
  context: ReactNode;
  tab: BenefitTab;
  onTabChange: (tab: BenefitTab) => void;
  operation: ReactNode;
  allocation: ReactNode;
  history: ReactNode;
}) {
  return (
    // coluna minmax(0,1fr): tabelas largas rolam no próprio contêiner, sem alargar a página no mobile
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h2 className="text-section-title text-foreground">{title}</h2>
        <p className="mt-0.5 text-body text-foreground-muted">{description}</p>
      </div>
      {context}
      <Tabs label={`${title}: operação, rateio e histórico`} items={BENEFIT_TABS} value={tab} onValueChange={(value) => onTabChange(value as BenefitTab)} variant="segmented">
        <TabPanel value="operacao" keepMounted className="mt-4 min-w-0">{operation}</TabPanel>
        <TabPanel value="rateio" className="mt-4 min-w-0">{allocation}</TabPanel>
        <TabPanel value="historico" className="mt-4 min-w-0">{history}</TabPanel>
      </Tabs>
    </div>
  );
}

/** Região "qual competência estou operando?": seletor de mês + fatos já carregados + ações da competência. */
export function BenefitCompetenceContext({ id, competence, onCompetenceChange, items, actions, loading = false }: {
  id: string;
  competence: string;
  onCompetenceChange: (value: string) => void;
  items: CompetenceSummaryItem[];
  actions?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card as="section" aria-label="Contexto da competência" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Competência" required id={id} className="w-full sm:w-56">{(control) => <input {...control} type="month" className={textInputClassName} value={competence} onChange={(event) => onCompetenceChange(event.target.value)} />}</Field>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {loading ? <SkeletonGroup label="Carregando a competência"><SkeletonCard lines={2} /></SkeletonGroup> : <CompetenceSummary items={items} />}
    </Card>
  );
}

export type BenefitHistoryRow = {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  status: { tone: StatusTone; label: string };
  version: string;
  obligation: string | null;
  amount: string;
  actions?: ReactNode;
};

/** Lançamentos da competência (dados que o módulo já carregou). Mesma estrutura nos três benefícios. */
export function BenefitHistory({ caption, rows, emptyTitle, emptyDescription }: { caption: string; rows: BenefitHistoryRow[]; emptyTitle: string; emptyDescription?: string }) {
  if (!rows.length) return <Card><EmptyState title={emptyTitle} description={emptyDescription} /></Card>;
  const columns: DataTableColumn<BenefitHistoryRow>[] = [
    { id: "title", header: "Lançamento", rowHeader: true, sticky: "start", width: "16rem", wrap: true, cell: (row) => <span className="grid min-w-0"><span>{row.title}</span>{row.detail && <span className="text-caption font-normal text-foreground-muted">{row.detail}</span>}</span> },
    { id: "status", header: "Situação", cell: (row) => <StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge> },
    { id: "version", header: "Versão", cell: (row) => <span className="tabular-nums">{row.version}</span> },
    { id: "obligation", header: "Obrigação", cell: (row) => row.obligation ? <span className="tabular-nums">{row.obligation}</span> : <span className="text-foreground-muted">Não gerada</span> },
    { id: "amount", header: "Valor", numeric: true, cell: (row) => <strong>{row.amount}</strong> },
  ];
  return <DataTable caption={caption} captionVisible columns={columns} rows={rows} getRowId={(row) => row.id} density="dense" minWidth="760px" rowActions={(row) => row.actions} actionsLabel="Ações" />;
}
