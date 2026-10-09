"use client";

// Importação de colaboradores (XLSX) no fluxo visual padrão: Selecionar → Processar (prévia, nada gravado) → Prévia com
// decisões por linha → Aplicar (o servidor reprocessa o MESMO arquivo, revalida e grava em uma transação) → Resultado.
// SÓ APRESENTAÇÃO: chamadas, overrides e o reenvio ficam na página; matching, CPF, datas e upsert seguem no servidor.
import { CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { DataTable, FeedbackAlert, ImportFlow, StatusBadge, textInputClassName, type DataTableColumn, type ImportFlowStep, type ImportIssue, type StatusTone } from "@/components/ui";
import { IMPORT_STATUS_LABELS, MATCHED_BY_LABELS, type ImportOverride, type ImportPreview, type ImportResult, type ImportRow, type ImportStatus } from "./types";

const STATUS_TONE: Record<ImportStatus, StatusTone> = { CREATE: "success", UPDATE: "info", UNCHANGED: "neutral", REVIEW: "warning", SKIP: "neutral", ERROR: "danger" };
// Linhas que dependem de decisão humana (as demais seguem automaticamente o resultado do servidor).
const needsDecision = (row: ImportRow) => (row.matchedBy !== null && ["ALIAS", "SIMILAR", "REVISAO"].includes(row.matchedBy)) || row.status === "REVIEW" || row.status === "SKIP";

type Props = {
  step: ImportFlowStep;
  file: File | null;
  preview: ImportPreview | null;
  result: ImportResult | null;
  filter: ImportStatus | "";
  overrides: Record<number, ImportOverride>;
  busy: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
  onProcess: () => void;
  onFilter: (status: ImportStatus | "") => void;
  onDecide: (sourceRow: number, action: ImportOverride) => void;
  onApply: () => void;
  onReset: () => void;
};

export function CollaboratorImport({ step, file, preview, result, filter, overrides, busy, onSelect, onClear, onProcess, onFilter, onDecide, onApply, onReset }: Props) {
  const errors: ImportIssue[] = preview?.blocked ? [{ id: "blocked", message: `Importação bloqueada: ${preview.counts.ERROR} linha(s) com erro. Corrija a planilha e analise novamente — nada foi gravado.` }] : [];
  const columns: DataTableColumn<ImportRow>[] = [
    { id: "row", header: "Linha", numeric: true, cell: (row) => row.sourceRow },
    { id: "file", header: "Arquivo", rowHeader: true, wrap: true, className: "min-w-[16rem]", cell: (row) => (
      <span className="grid gap-0.5">
        <strong>{row.file.officialName || "—"}</strong>
        <span className="text-caption font-normal text-foreground-muted">{row.file.department ?? "—"} · {row.file.costCenter ?? "—"}</span>
        <span className="text-caption font-normal tabular-nums text-foreground-muted">CPF: {row.file.cpf ?? "—"} · Admissão: {row.file.admissionDate ?? "—"}</span>
      </span>
    ) },
    { id: "match", header: "Cadastro encontrado", wrap: true, className: "min-w-[14rem]", cell: (row) => (row.match
      ? <span className="grid gap-0.5"><strong>{row.match.officialName}</strong><span className="text-caption text-foreground-muted">{row.matchedBy ? MATCHED_BY_LABELS[row.matchedBy] : ""}{row.match.cpf ? ` · CPF ${row.match.cpf}` : ""}</span></span>
      : <span className="text-foreground-muted">{row.status === "CREATE" ? "Novo cadastro" : "—"}</span>) },
    { id: "result", header: "Resultado", wrap: true, className: "min-w-[12rem]", cell: (row) => (
      <span className="grid justify-items-start gap-0.5">
        <StatusBadge tone={STATUS_TONE[row.status]}>{IMPORT_STATUS_LABELS[row.status]}</StatusBadge>
        {row.changes.length > 0 && <span className="text-caption text-foreground-muted">{row.changes.join(", ")}</span>}
        {row.errors.map((error) => <span key={error} className="text-caption text-danger-text">{error}</span>)}
      </span>
    ) },
    { id: "decision", header: "Decisão", cell: (row) => (needsDecision(row)
      ? <select aria-label={`Decisão da linha ${row.sourceRow}`} className={`${textInputClassName} h-9 min-w-[9rem]`} disabled={busy} value={overrides[row.sourceRow] ?? "SKIP"} onChange={(event) => onDecide(row.sourceRow, event.target.value as ImportOverride)}>
          <option value="SKIP">Ignorar linha</option>
          {row.match && <option value="UPDATE">Atualizar o cadastro sugerido</option>}
          <option value="CREATE">Criar novo colaborador</option>
        </select>
      : <span className="text-caption text-foreground-muted">Automático</span>) },
  ];
  return (
    <ImportFlow
      step={step}
      title="Importação de colaboradores"
      description="Use a máscara baixada em “Baixar máscara”: ela já vem com a base atual e a coluna ID, que identifica cada colaborador na reimportação. Linhas sem ID são localizadas por CPF ou nome exato; nome parecido fica para revisão. Célula vazia não apaga o dado atual. Nada é gravado antes da confirmação."
      file={file ? { name: file.name, size: file.size } : null}
      onSelect={onSelect}
      onClearFile={onClear}
      accept=".xlsx"
      uploadLabel="Planilha de colaboradores (XLSX)"
      uploadHelper="O servidor revalida tudo ao confirmar; qualquer erro bloqueia a gravação inteira."
      onProcess={onProcess}
      processLabel="Analisar arquivo"
      processingText="Analisando a planilha…"
      errors={errors}
      canApply={Boolean(preview && !preview.blocked && preview.counts.CREATE + preview.counts.UPDATE > 0)}
      applyHint={preview && !preview.blocked && preview.counts.CREATE + preview.counts.UPDATE === 0 ? "Nada a criar ou atualizar nesta planilha." : undefined}
      onApply={onApply}
      applyLabel="Confirmar importação"
      onReset={onReset}
      resetLabel="Nova importação"
      preview={preview && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar linhas da prévia">
            {([["", "Linhas", preview.total], ...(Object.keys(IMPORT_STATUS_LABELS) as ImportStatus[]).map((key) => [key, IMPORT_STATUS_LABELS[key], preview.counts[key] ?? 0])] as Array<[ImportStatus | "", string, number]>).map(([key, label, value]) => (
              <button key={key || "all"} type="button" aria-pressed={filter === key} onClick={() => onFilter(key)} className={clsx("grid min-w-24 cursor-pointer rounded-control border px-3 py-2 text-left", filter === key ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-muted", key === "ERROR" && value > 0 && "border-danger/40 text-danger-text")}>
                <strong className="text-card-title tabular-nums">{value}</strong>
                <span className="text-caption text-foreground-muted">{label}</span>
              </button>
            ))}
          </div>
          <DataTable caption="Prévia da importação" columns={columns} rows={preview.rows.filter((row) => !filter || row.status === filter)} getRowId={(row) => String(row.sourceRow)} density="dense" minWidth="960px" maxHeight="28rem" />
        </div>
      )}
      result={result && (
        <FeedbackAlert status="success" icon={<CheckCircle2 size={18} />} title="Importação concluída">
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
            {([["Total processado", result.total], ["Criados", result.created], ["Atualizados", result.updated], ["Sem alteração", result.unchanged], ["Ignorados", result.skipped], ["Erros", result.errors]] as const).map(([label, value]) => (
              <div key={label} className="rounded-control border border-border bg-surface px-3 py-2"><dt className="text-caption text-foreground-muted">{label}</dt><dd className="text-card-title tabular-nums">{value}</dd></div>
            ))}
          </dl>
        </FeedbackAlert>
      )}
    />
  );
}
