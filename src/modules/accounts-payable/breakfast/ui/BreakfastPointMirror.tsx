"use client";

// Espelho de Ponto do Café da Manhã no fluxo visual padrão (ImportFlow + UploadDropzone), SEM etapa de revisão:
// Selecionar → Processar → Prévia → Aplicar → Resultado. SÓ APRESENTAÇÃO: o processamento (servidor, match por CPF,
// +1 por data em sábado/domingo/feriado) e o "Aplicar" (atribui Quantidade Extras, idempotente) ficam na
// BreakfastSection e chegam por props/callbacks. Nada aqui calcula quantidade ou valor.
import { CheckCircle2 } from "lucide-react";
import { DataTable, FeedbackAlert, ImportFlow, StatusBadge, type DataTableColumn, type ImportFlowStep, type ImportIssue, type StatusTone } from "@/components/ui";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { MAX_POINT_MIRROR_FILE_SIZE } from "../point-mirror";
import { isoBr, people as peopleLabel } from "./format";

export type BreakfastPointMirrorStatus = "APPLY" | "NOT_SELECTED" | "NOT_ELIGIBLE" | "NOT_FOUND" | "INVALID_CPF" | "NOT_IN_FILE";
export type BreakfastPointMirrorPerson = { employeeId: string | null; employeeName: string; cpfMasked: string; saturdays: number; sundays: number; holidays: number; extraQuantity: number; status: BreakfastPointMirrorStatus };
export type BreakfastPointMirrorPreview = {
  period: { from: string; to: string } | null;
  totals: { rows: number; people: number; saturdays: number; sundays: number; holidays: number; extraDates: number; peopleWithExtras: number; located: number; notFound: number; apply: number; notSelected: number; notEligible: number; notInFile: number; invalidCpf: number };
  warnings: string[];
  people: BreakfastPointMirrorPerson[];
};

const STATUS_LABEL = (status: BreakfastPointMirrorStatus, extra: number) => ({ APPLY: extra ? "Será aplicado" : "Presente no arquivo com 0 extras", NOT_SELECTED: "Encontrado no arquivo, mas não selecionado", NOT_ELIGIBLE: "Fora do TOPOGEO ou inativo", NOT_FOUND: "Não localizado (CPF)", INVALID_CPF: "CPF inválido", NOT_IN_FILE: "Selecionado, não está no arquivo — mantém o valor atual" })[status];
// Tom só reforça o texto (nunca só cor).
const STATUS_TONE: Partial<Record<BreakfastPointMirrorStatus, StatusTone>> = { NOT_FOUND: "warning", INVALID_CPF: "warning", NOT_ELIGIBLE: "warning" };

type Props = {
  description: string;
  file: File | null;
  busy: boolean;
  preview: (BreakfastPointMirrorPreview & { competence: string }) | null;
  stale: boolean;
  /** Quantidade de colaboradores que receberam as extras desta prévia (null = ainda não aplicada). */
  appliedCount: number | null;
  monthLabel: string;
  /** Quantidade Extras digitada hoje na tela (coluna "Atual"); undefined = colaborador não selecionado. */
  currentExtra: (employeeId: string | null) => string | undefined;
  onSelect: (file: File) => void;
  onClearFile: () => void;
  onProcess: () => void;
  onApply: () => void;
  onReset: () => void;
};

export function BreakfastPointMirror({ description, file, busy, preview, stale, appliedCount, monthLabel, currentExtra, onSelect, onClearFile, onProcess, onApply, onReset }: Props) {
  const step: ImportFlowStep = busy ? "processing" : preview && appliedCount !== null ? "done" : preview ? "preview" : "select";
  const errors: ImportIssue[] = stale ? [{ id: "stale", message: "A competência mudou depois do processamento; processe o arquivo novamente." }] : [];
  const warnings: ImportIssue[] = preview?.warnings.length ? [{ id: "day", message: `${preview.warnings.length} aviso(s) de conferência (coluna Dia × Data). Não bloqueiam a aplicação.`, detail: <ul className="list-inside list-disc">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> }] : [];
  return (
    <ImportFlow
      step={step}
      title="Importar Espelho de Ponto — Quantidade Extras (opcional)"
      description={description}
      file={file ? { name: file.name, size: file.size } : null}
      onSelect={onSelect}
      onClearFile={onClearFile}
      accept=".csv,.xlsx"
      maxSize={MAX_POINT_MIRROR_FILE_SIZE}
      uploadLabel="Espelho de Ponto (CSV ou XLSX, até 10 MB)"
      uploadHelper="Identificação somente por CPF. O arquivo não é armazenado."
      onProcess={onProcess}
      processingText="Processando o Espelho de Ponto…"
      errors={errors}
      warnings={warnings}
      canApply={Boolean(preview?.totals.apply) && !stale}
      applyHint={preview && !preview.totals.apply ? "Nenhum colaborador selecionado com extras a aplicar." : undefined}
      onApply={onApply}
      applyLabel="Aplicar Quantidades Extras"
      onReset={onReset}
      resetLabel="Processar outro arquivo"
      preview={preview && <PreviewContent preview={preview} monthLabel={monthLabel} currentExtra={currentExtra} />}
      result={appliedCount !== null && (
        <FeedbackAlert status="success" icon={<CheckCircle2 size={18} />} title="Aplicado à tabela — ainda não salvo">
          Quantidade Extras atribuída a {peopleLabel(appliedCount)} (substitui, não soma). Os valores continuam editáveis; use “Salvar / Gerar Rateio” para confirmar.
        </FeedbackAlert>
      )}
    />
  );
}

function PreviewContent({ preview, monthLabel, currentExtra }: { preview: BreakfastPointMirrorPreview; monthLabel: string; currentExtra: Props["currentExtra"] }) {
  const t = preview.totals;
  const kpis = [["Período do ponto", preview.period ? `${isoBr(preview.period.from)} a ${isoBr(preview.period.to)}` : "—"], ["Competência", monthLabel], ["Linhas analisadas", t.rows], ["Colaboradores no arquivo", t.people], ["Localizados (CPF)", t.located], ["Não localizados", t.notFound + t.invalidCpf], ["Dias extras", `${t.extraDates} (Sáb ${t.saturdays} · Dom ${t.sundays} · Fer ${t.holidays})`], ["Serão aplicados", t.apply]] as const;
  // Ordem de leitura: quem será aplicado primeiro, depois por nome (apenas exibição).
  const rows = [...preview.people].sort((a, b) => Number(b.status === "APPLY") - Number(a.status === "APPLY") || comparePtBr(a.employeeName, b.employeeName));
  const position = new Map(rows.map((person, index) => [person, index]));
  const count = (person: BreakfastPointMirrorPerson, value: number) => (person.status === "NOT_IN_FILE" ? "—" : value);
  const columns: DataTableColumn<BreakfastPointMirrorPerson>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, sticky: "start", width: "13rem", cell: (person) => <span className="block truncate">{person.employeeName}</span> },
    { id: "cpf", header: "CPF", cell: (person) => <span className="tabular-nums text-foreground-muted">{person.cpfMasked || "—"}</span> },
    { id: "saturdays", header: "Sáb.", numeric: true, cell: (person) => count(person, person.saturdays) },
    { id: "sundays", header: "Dom.", numeric: true, cell: (person) => count(person, person.sundays) },
    { id: "holidays", header: "Feriado", numeric: true, cell: (person) => count(person, person.holidays) },
    { id: "suggested", header: "Extras sugeridas", numeric: true, cell: (person) => <strong>{count(person, person.extraQuantity)}</strong> },
    { id: "current", header: "Atual", numeric: true, cell: (person) => currentExtra(person.employeeId) ?? "—" },
    { id: "status", header: "Situação", wrap: true, className: "min-w-[14rem]", cell: (person) => {
      const label = STATUS_LABEL(person.status, person.extraQuantity);
      if (person.status === "APPLY" && person.extraQuantity) return <StatusBadge tone="success">{label}</StatusBadge>;
      const tone = STATUS_TONE[person.status];
      return tone ? <StatusBadge tone={tone}>{label}</StatusBadge> : <span className="text-foreground-muted">{label}</span>;
    } },
  ];
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-control border border-border bg-surface-muted px-3 py-2">
            <dt className="truncate text-caption text-foreground-muted">{label}</dt>
            <dd className="text-card-title tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <DataTable caption={`Prévia do Espelho de Ponto — ${peopleLabel(rows.length)}`} columns={columns} rows={rows} getRowId={(person) => `${person.employeeId ?? person.cpfMasked}-${position.get(person)}`} density="dense" minWidth="900px" maxHeight="24rem" />
      <p className="text-caption text-foreground-muted">Substitui (não soma) a Quantidade Extras dos {t.apply} colaborador(es) selecionados encontrados; os demais não mudam. Nada é salvo antes de “Salvar / Gerar Rateio”.</p>
    </div>
  );
}
