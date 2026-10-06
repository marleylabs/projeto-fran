"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, XCircle } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";
import { FeedbackAlert } from "./FeedbackAlert";
import { SkeletonGroup, Skeleton } from "./Skeleton";
import { UploadDropzone, type UploadFileLike } from "./UploadDropzone";

// Fluxo visual de importação: Selecionar → Processar → Prévia → Aplicar → Resultado.
// 100% CONTROLADO pelo módulo: ele envia o arquivo, chama a própria API, monta a prévia e decide o passo (`step`).
// Este componente não faz requisições e não conhece nenhum domínio (Cesta, Café, VT, Férias, CPF...).
// Erros BLOQUEIAM a aplicação; avisos NÃO bloqueiam — diferenciados por ícone + texto + cor (nunca só cor).
export type ImportFlowStep = "select" | "processing" | "preview" | "applying" | "done";

export type ImportIssue = { id: string; message: ReactNode; detail?: ReactNode };

export const IMPORT_FLOW_STEPS = [
  { key: "select", label: "Selecionar" },
  { key: "processing", label: "Processar" },
  { key: "preview", label: "Prévia" },
  { key: "applying", label: "Aplicar" },
  { key: "done", label: "Resultado" },
] as const;

export type ImportStepState = "complete" | "current" | "upcoming";

/** Estado de cada etapa do stepper para o passo atual. "done" marca todas como concluídas. */
export function importStepStates(step: ImportFlowStep): ImportStepState[] {
  const current = IMPORT_FLOW_STEPS.findIndex((item) => item.key === step);
  return IMPORT_FLOW_STEPS.map((_, index) => (step === "done" || index < current ? "complete" : index === current ? "current" : "upcoming"));
}

/** Pode aplicar? Só na prévia, sem erros e sem veto do consumidor. */
export function canApplyImport({ step, errors = [], canApply = true }: { step: ImportFlowStep; errors?: readonly ImportIssue[]; canApply?: boolean }) {
  return step === "preview" && errors.length === 0 && canApply;
}

const STATE_TEXT: Record<ImportStepState, string> = { complete: "concluída", current: "etapa atual", upcoming: "pendente" };

export function ImportStepper({ step, className }: { step: ImportFlowStep; className?: string }) {
  const states = importStepStates(step);
  const busy = step === "processing" || step === "applying";
  return (
    <ol aria-label="Etapas da importação" className={clsx("flex flex-wrap items-center gap-x-2 gap-y-2", className)}>
      {IMPORT_FLOW_STEPS.map((item, index) => {
        const state = states[index];
        return (
          <li key={item.key} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true" className={clsx("h-px w-4 sm:w-8", state === "upcoming" ? "bg-border-strong" : "bg-primary")} />}
            <span
              aria-hidden="true"
              className={clsx(
                "grid size-6 shrink-0 place-items-center rounded-full border text-caption font-bold tabular-nums",
                state === "complete" && "border-primary bg-primary text-surface",
                state === "current" && "border-primary bg-primary-soft text-primary",
                state === "upcoming" && "border-border-strong bg-surface text-foreground-muted",
              )}
            >
              {state === "complete" ? <Check size={14} strokeWidth={3} /> : state === "current" && busy ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : index + 1}
            </span>
            <span className={clsx("text-caption", state === "current" ? "font-semibold text-foreground" : "text-foreground-muted", state !== "current" && "hidden md:inline")}>
              {item.label}
              <span className="sr-only"> ({STATE_TEXT[state]})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Lista de erros (bloqueiam) e avisos (não bloqueiam) da prévia. Reutilizável fora do ImportFlow. */
export function ImportIssues({ errors = [], warnings = [] }: { errors?: readonly ImportIssue[]; warnings?: readonly ImportIssue[] }) {
  if (!errors.length && !warnings.length) return null;
  const list = (items: readonly ImportIssue[]) => (
    <ul className="mt-1.5 grid list-disc gap-1 pl-4">
      {items.map((issue) => (
        <li key={issue.id}>
          {issue.message}
          {issue.detail && <span className="block text-caption text-foreground-muted">{issue.detail}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-3">
      {errors.length > 0 && (
        <FeedbackAlert status="error" icon={<XCircle size={18} />} title={`${errors.length} ${errors.length === 1 ? "erro impede" : "erros impedem"} a aplicação`}>
          <p className="text-caption font-semibold uppercase tracking-wide text-danger-text">Bloqueia · corrija o arquivo e processe novamente</p>
          {list(errors)}
        </FeedbackAlert>
      )}
      {warnings.length > 0 && (
        <FeedbackAlert status="warning" icon={<AlertTriangle size={18} />} title={`${warnings.length} ${warnings.length === 1 ? "aviso" : "avisos"} para revisar`}>
          <p className="text-caption font-semibold uppercase tracking-wide text-warning-text">Não bloqueia · a aplicação continua permitida</p>
          {list(warnings)}
        </FeedbackAlert>
      )}
    </div>
  );
}

export type ImportFlowProps = {
  step: ImportFlowStep;
  title?: ReactNode;
  description?: ReactNode;
  // Seleção (UploadDropzone)
  file: UploadFileLike | null;
  onSelect: (file: File) => void;
  onClearFile?: () => void;
  accept?: string;
  maxSize?: number;
  uploadLabel?: ReactNode;
  uploadHelper?: ReactNode;
  /** Quando informado, mostra "Processar arquivo" após a seleção; sem ele o módulo processa direto no onSelect. */
  onProcess?: () => void;
  processLabel?: string;
  processingText?: ReactNode;
  // Prévia
  preview?: ReactNode;
  errors?: readonly ImportIssue[];
  warnings?: readonly ImportIssue[];
  /** Veto extra do consumidor (ex.: nada selecionado). Erros já bloqueiam por si. */
  canApply?: boolean;
  applyHint?: ReactNode;
  onApply: () => void;
  applyLabel?: string;
  // Resultado / falhas
  result?: ReactNode;
  /** Falha de processamento/aplicação (ex.: servidor recusou). Mostrada com ação de recomeçar. */
  failure?: ReactNode;
  onReset: () => void;
  resetLabel?: string;
  className?: string;
};

export function ImportFlow({
  step, title, description, file, onSelect, onClearFile, accept, maxSize, uploadLabel = "Selecione o arquivo", uploadHelper,
  onProcess, processLabel = "Processar arquivo", processingText = "Processando o arquivo…",
  preview, errors = [], warnings = [], canApply = true, applyHint, onApply, applyLabel = "Aplicar",
  result, failure, onReset, resetLabel = "Nova importação", className,
}: ImportFlowProps) {
  const headingId = `${useId()}-import-step`;
  const panel = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  const applyAllowed = canApplyImport({ step, errors, canApply });
  const stepLabel = IMPORT_FLOW_STEPS.find((item) => item.key === step)?.label ?? "";

  // A cada troca de etapa o foco vai para o título do painel: teclado e leitor de tela acompanham o fluxo.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    panel.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus();
  }, [step]);

  return (
    <section aria-labelledby={title ? `${headingId}-title` : headingId} className={clsx("grid gap-4", className)}>
      {(title || description) && (
        <div>
          {title && <h2 id={`${headingId}-title`} className="text-section-title text-foreground">{title}</h2>}
          {description && <p className="mt-1 text-body text-foreground-muted">{description}</p>}
        </div>
      )}
      <ImportStepper step={step} />
      <div ref={panel} className="grid gap-4" aria-busy={step === "processing" || step === "applying" || undefined}>
        <h3 id={headingId} data-step-heading="" tabIndex={-1} className="text-card-title text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {step === "done" ? "Resultado da importação" : `Etapa ${IMPORT_FLOW_STEPS.findIndex((item) => item.key === step) + 1} de ${IMPORT_FLOW_STEPS.length} — ${stepLabel}`}
        </h3>

        {failure && (
          <FeedbackAlert status="error" title="Não foi possível concluir">
            <div className="grid gap-2">
              <div>{failure}</div>
              <div><Button variant="secondary" size="sm" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Recomeçar</Button></div>
            </div>
          </FeedbackAlert>
        )}

        {step === "select" && (
          <>
            <UploadDropzone label={uploadLabel} file={file} onFileSelect={onSelect} onClear={onClearFile} accept={accept} maxSize={maxSize} helperText={uploadHelper} />
            {onProcess && (
              <div className="flex justify-end">
                <Button onClick={onProcess} disabled={!file}>{processLabel}</Button>
              </div>
            )}
          </>
        )}

        {step === "processing" && (
          <SkeletonGroup label={typeof processingText === "string" ? processingText : "Processando…"} className="grid gap-3">
            <p className="flex items-center gap-2 text-body text-foreground-muted" aria-hidden="true">
              <Loader2 size={16} className="animate-spin text-primary motion-reduce:animate-none" />
              {processingText}
            </p>
            <Skeleton variant="block" className="h-16" />
            <Skeleton className="w-3/4" />
            <Skeleton className="w-1/2" />
          </SkeletonGroup>
        )}

        {(step === "preview" || step === "applying") && (
          <>
            <ImportIssues errors={errors} warnings={warnings} />
            {preview && <div className="min-w-0">{preview}</div>}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
              {!applyAllowed && step === "preview" && (
                <p className="mr-auto text-caption text-foreground-muted">
                  {errors.length > 0 ? "Corrija os erros para liberar a aplicação." : applyHint}
                </p>
              )}
              <Button variant="secondary" onClick={onReset} disabled={step === "applying"}>Cancelar</Button>
              <Button onClick={onApply} disabled={!applyAllowed} loading={step === "applying"}>{step === "applying" ? "Aplicando…" : applyLabel}</Button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            {result}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />{resetLabel}</Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
