"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertCircle, CloudUpload, FileText, X } from "lucide-react";
import clsx from "clsx";

// Área de upload reutilizável: arrastar-e-soltar OU clicar/teclado (o controle real é um <input type="file"> nativo,
// visualmente oculto e focável — Tab chega nele, Enter/Espaço abrem o seletor do sistema). Arrastar nunca é o único
// caminho (WCAG 2.5.7). Valida SÓ o que recebe por props (accept/maxSize) — nenhum formato de domínio embutido.
// Controlada: o consumidor guarda o arquivo (`file`) e decide o que fazer com ele (`onFileSelect`).

export type UploadFileLike = { name: string; size: number; type?: string };

/** Tamanho legível em pt-BR ("512 B", "1,5 KB", "2,3 MB"). */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** O arquivo atende ao `accept` (mesma sintaxe do atributo HTML: ".xlsx", "text/csv", "image/*")? Vazio = aceita tudo. */
export function matchesAccept(file: UploadFileLike, accept?: string) {
  const rules = (accept ?? "").split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/** Mensagem de erro de formato/tamanho (ou null). Só usa as regras recebidas. */
export function validateUploadFile(file: UploadFileLike, { accept, maxSize }: { accept?: string; maxSize?: number }) {
  if (!matchesAccept(file, accept)) return `Formato não aceito. Envie um arquivo ${acceptLabel(accept)}.`;
  if (maxSize !== undefined && file.size > maxSize) return `O arquivo tem ${formatFileSize(file.size)}; o limite é ${formatFileSize(maxSize)}.`;
  return null;
}

const acceptLabel = (accept?: string) => (accept ?? "").split(",").map((rule) => rule.trim()).filter(Boolean).map((rule) => rule.replace(/^\./, "").toUpperCase()).join(", ");

export type UploadDropzoneProps = {
  label: ReactNode;
  file: UploadFileLike | null;
  onFileSelect: (file: File) => void;
  onClear?: () => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  helperText?: ReactNode;
  /** Erro vindo do consumidor (ex.: arquivo recusado pelo servidor). Erros de accept/maxSize são internos. */
  error?: ReactNode;
  id?: string;
  className?: string;
};

export function UploadDropzone({ label, file, onFileSelect, onClear, accept, maxSize, disabled = false, helperText, error, id, className }: UploadDropzoneProps) {
  const generated = useId();
  const inputId = id ?? `upload-${generated}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error;
  const rules = [accept && `Formatos: ${acceptLabel(accept)}`, maxSize !== undefined && `até ${formatFileSize(maxSize)}`].filter(Boolean).join(" · ");

  const take = (candidate: File | undefined) => {
    if (!candidate || disabled) return;
    const problem = validateUploadFile(candidate, { accept, maxSize });
    setLocalError(problem);
    if (!problem) onFileSelect(candidate);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = event.dataTransfer.files;
    if (files.length > 1) { setLocalError("Envie apenas um arquivo por vez."); return; }
    take(files[0]);
  };

  return (
    <div className={clsx("grid gap-1.5", className)}>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={[shownError ? errorId : null, hintId].filter(Boolean).join(" ")}
        aria-invalid={shownError ? true : undefined}
        // Visualmente oculto mas focável; o foco aparece no contorno da área (peer-focus-visible).
        className="peer sr-only"
        onChange={(event) => { take(event.target.files?.[0]); event.target.value = ""; }}
      />
      <label
        htmlFor={inputId}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className={clsx(
          "flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center transition-colors motion-reduce:transition-none",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
          disabled
            ? "cursor-not-allowed border-border bg-surface-muted text-foreground-muted"
            : dragging
              ? "cursor-copy border-primary bg-primary-soft"
              : shownError
                ? "cursor-pointer border-danger/50 bg-surface hover:border-danger"
                : "cursor-pointer border-border-strong bg-surface hover:border-primary/60 hover:bg-surface-muted",
        )}
      >
        <span aria-hidden="true" className={clsx("grid size-10 place-items-center rounded-full", disabled ? "bg-border/60" : "bg-primary-soft text-primary")}>
          <CloudUpload size={20} />
        </span>
        <span className="text-card-title text-foreground">{label}</span>
        <span className="text-body text-foreground-muted">
          {dragging ? "Solte o arquivo para selecionar" : <>Arraste o arquivo para cá ou <span className={clsx("font-semibold", !disabled && "text-primary underline underline-offset-2")}>clique para selecionar</span></>}
        </span>
      </label>
      <p id={hintId} className="text-caption text-foreground-muted">
        {[helperText, rules].filter(Boolean).map((part, index) => <span key={index}>{index > 0 && " · "}{part}</span>)}
      </p>
      {file && (
        <div className="flex items-center gap-3 rounded-control border border-border bg-surface-muted px-3 py-2" aria-live="polite">
          <FileText size={18} aria-hidden="true" className="shrink-0 text-foreground-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-foreground">{file.name}</p>
            <p className="text-caption text-foreground-muted tabular-nums">{formatFileSize(file.size)}</p>
          </div>
          {onClear && !disabled && (
            <button type="button" onClick={() => { setLocalError(null); onClear(); input.current?.focus(); }} aria-label={`Remover ${file.name}`} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface hover:text-foreground motion-reduce:transition-none">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {shownError && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-caption font-medium text-danger-text">
          <AlertCircle size={14} aria-hidden="true" className="mt-px shrink-0" />
          <span>{shownError}</span>
        </p>
      )}
    </div>
  );
}
