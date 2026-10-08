"use client";

// Etapa "Revisar" do Espelho de Ponto da Cesta (Fase 7E.3): uma linha por OCORRÊNCIA (data + tipo), com Aprovar/Rejeitar.
// SÓ APRESENTAÇÃO: candidatos, decisões, Férias manuais e o impacto previsto chegam por props (calculados na seção com as
// mesmas funções puras do servidor). Nada é aplicado aqui; o "Aplicar" e o salvamento revalidam no servidor.
import { useState } from "react";
import { Check, X } from "lucide-react";
import clsx from "clsx";
import { Button, DataTable, StatusBadge, type DataTableColumn, type StatusTone } from "@/components/ui";
import { formatDateOnlyBR } from "@/lib/date-only";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { BASIC_BASKET_CALCULATION_DAYS } from "../calculations";
import { pointMirrorReviewState, type PointMirrorCandidate, type PointMirrorDecision, type PointMirrorReviewState } from "../point-mirror-review";
import { moneyCents } from "./format";
import { CompetenceSummary } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";

export type PointMirrorImpact = { employeeId: string; name: string; manual: boolean; beforeDays: number; afterDays: number; beforeCents: number; afterCents: number; error?: string | null };
type Reference = { current: string; previous: string; absence: string };
type Filter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "VACATION" | "ABSENCE";

const STATE: Record<PointMirrorReviewState, { tone: StatusTone; label: string }> = {
  PENDING: { tone: "pending", label: "Pendente" },
  APPROVED: { tone: "success", label: "Aprovado" },
  REJECTED: { tone: "danger", label: "Rejeitado" },
  IGNORED: { tone: "neutral", label: "Ignorado" },
  MANUAL_OVERRIDE: { tone: "info", label: "Sem efeito (manual)" },
};
const EVENT = { ABSENCE: "Falta Injustificada", VACATION_CURRENT: "Férias", VACATION_REFERENCE: "Férias (mês anterior)" } as const;
const FILTERS: Array<{ id: Filter; label: string }> = [{ id: "ALL", label: "Todos" }, { id: "PENDING", label: "Pendentes" }, { id: "APPROVED", label: "Aprovados" }, { id: "REJECTED", label: "Rejeitados" }, { id: "VACATION", label: "Férias" }, { id: "ABSENCE", label: "Faltas" }];

export function BasicBasketPointMirrorReview({ candidates, decisions, manualByEmployee, employeeName, reference, impacts, onDecide }: {
  candidates: readonly PointMirrorCandidate[];
  decisions: Readonly<Record<string, PointMirrorDecision>>;
  manualByEmployee: Readonly<Record<string, number | null>>;
  employeeName: (employeeId: string) => string;
  reference: Reference;
  impacts: PointMirrorImpact[];
  onDecide: (ids: string[], decision: PointMirrorDecision) => void;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const stateOf = (candidate: PointMirrorCandidate) => pointMirrorReviewState(candidate, decisions[candidate.id], manualByEmployee[candidate.employeeId]);
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, IGNORED: 0, MANUAL_OVERRIDE: 0 };
  for (const candidate of candidates) counts[stateOf(candidate)] += 1;
  const rows = candidates
    .filter((candidate) => filter === "ALL" || (filter === "VACATION" ? candidate.kind !== "ABSENCE" : filter === "ABSENCE" ? candidate.kind === "ABSENCE" : stateOf(candidate) === filter))
    .sort((a, b) => comparePtBr(employeeName(a.employeeId), employeeName(b.employeeId)) || a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const pendingVisible = rows.filter((candidate) => stateOf(candidate) === "PENDING").map((candidate) => candidate.id);

  const period = (candidate: PointMirrorCandidate) => candidate.kind === "VACATION_CURRENT" ? `Cesta ${reference.current}` : candidate.kind === "VACATION_REFERENCE" ? `Retroativo ${reference.previous}` : candidate.date.slice(0, 7) === `${reference.absence.slice(3)}-${reference.absence.slice(0, 2)}` ? `Apuração ${reference.absence}` : `Competência ${reference.current}`;
  const impact = (candidate: PointMirrorCandidate) => {
    const state = stateOf(candidate);
    if (state === "IGNORED") return candidate.ignoredReason;
    if (state === "MANUAL_OVERRIDE") return "Sem efeito financeiro enquanto houver Férias manuais.";
    return candidate.effects.map((effect) => effect === "CURRENT_CUT" ? `Corta a Cesta de ${reference.current}` : effect === "RETRO_CUT" ? `Zera o Retroativo de ${reference.previous}` : effect === "CURRENT_VACATION" ? `Dia de Férias na Cesta de ${reference.current} (base ${BASIC_BASKET_CALCULATION_DAYS})` : `Dia de Férias no Retroativo de ${reference.previous}`).join(" · ");
  };
  const columns: DataTableColumn<PointMirrorCandidate>[] = [
    { id: "employee", header: "Colaborador", rowHeader: true, sticky: "start", width: "13rem", cell: (candidate) => <span className="block truncate">{employeeName(candidate.employeeId)}</span> },
    { id: "date", header: "Data", cell: (candidate) => <span className="tabular-nums">{formatDateOnlyBR(candidate.date)}</span> },
    { id: "event", header: "Evento", cell: (candidate) => EVENT[candidate.kind] },
    { id: "period", header: "Período de impacto", cell: period },
    { id: "impact", header: "Impacto previsto", wrap: true, className: "min-w-[15rem]", cell: (candidate) => <span className={clsx(stateOf(candidate) === "IGNORED" || stateOf(candidate) === "MANUAL_OVERRIDE" ? "text-foreground-muted" : "text-foreground")}>{impact(candidate)}</span> },
    { id: "state", header: "Situação", cell: (candidate) => { const state = STATE[stateOf(candidate)]; return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>; } },
    { id: "decision", header: "Decisão", cell: (candidate) => {
      const state = stateOf(candidate);
      if (state === "IGNORED" || state === "MANUAL_OVERRIDE") return <span className="text-caption text-foreground-muted">Sem decisão</span>;
      const label = `${EVENT[candidate.kind]} de ${employeeName(candidate.employeeId)} em ${formatDateOnlyBR(candidate.date)}`;
      return (
        <span className="inline-flex gap-1" role="group" aria-label={`Decisão: ${label}`}>
          <Button size="sm" variant={state === "APPROVED" ? "primary" : "secondary"} aria-pressed={state === "APPROVED"} onClick={() => onDecide([candidate.id], "APPROVED")}><Check size={14} aria-hidden="true" />Aprovar</Button>
          <Button size="sm" variant={state === "REJECTED" ? "error" : "secondary"} aria-pressed={state === "REJECTED"} onClick={() => onDecide([candidate.id], "REJECTED")}><X size={14} aria-hidden="true" />Rejeitar</Button>
        </span>
      );
    } },
  ];

  return (
    <div className="grid gap-3">
      <CompetenceSummary items={[
        { label: "Encontradas", value: candidates.length },
        { label: "Pendentes", value: counts.PENDING, emphasis: counts.PENDING > 0 },
        { label: "Aprovadas", value: counts.APPROVED },
        { label: "Rejeitadas", value: counts.REJECTED },
        { label: "Ignoradas", value: counts.IGNORED, helper: "Sem efeito financeiro" },
        { label: "Sem efeito (manual)", value: counts.MANUAL_OVERRIDE, helper: "Férias manuais informadas" },
      ]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filtrar ocorrências" className="inline-flex flex-wrap gap-1 rounded-control border border-border bg-surface-muted p-1">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className="h-8 cursor-pointer rounded-md px-3 text-button text-foreground-muted hover:text-foreground aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-elevation-sm">{item.label}</button>
          ))}
        </div>
        {pendingVisible.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onDecide(pendingVisible, "APPROVED")}><Check size={14} aria-hidden="true" />Aprovar {pendingVisible.length} {pendingVisible.length === 1 ? "ocorrência pendente" : "ocorrências pendentes"}</Button>
            <Button size="sm" variant="secondary" onClick={() => onDecide(pendingVisible, "REJECTED")}><X size={14} aria-hidden="true" />Rejeitar {pendingVisible.length} {pendingVisible.length === 1 ? "ocorrência pendente" : "ocorrências pendentes"}</Button>
          </div>
        )}
      </div>
      <DataTable caption="Ocorrências do Espelho de Ponto para revisão" columns={columns} rows={rows} getRowId={(candidate) => candidate.id} density="dense" minWidth="1080px" maxHeight="26rem" empty={{ title: filter === "ALL" ? "Nenhuma ocorrência de Falta ou Férias para revisar." : "Nenhuma ocorrência neste filtro." }} />
      {impacts.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-label text-foreground-muted">Impacto previsto na Cesta (prévia; o servidor recalcula ao aplicar e ao salvar)</h4>
          <DataTable
            caption="Impacto previsto por colaborador"
            rows={impacts}
            getRowId={(row) => row.employeeId}
            density="dense"
            minWidth="640px"
            columns={[
              { id: "name", header: "Colaborador", rowHeader: true, cell: (row) => <span className="block truncate">{row.name}</span> },
              { id: "days", header: "Dias da Cesta", numeric: true, cell: (row) => `${row.beforeDays}/${BASIC_BASKET_CALCULATION_DAYS} → ${row.afterDays}/${BASIC_BASKET_CALCULATION_DAYS}` },
              { id: "value", header: "Total", numeric: true, cell: (row) => row.error ? <span className="text-danger-text">{row.error}</span> : <span>{moneyCents(row.beforeCents)} → <strong>{moneyCents(row.afterCents)}</strong></span> },
              { id: "source", header: "Férias da competência", cell: (row) => (row.manual ? "Manual" : "Espelho de Ponto (aprovadas)") },
            ]}
          />
        </div>
      )}
    </div>
  );
}
