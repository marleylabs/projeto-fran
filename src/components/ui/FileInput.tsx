"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";

// Input de arquivo compacto (botão + nome do arquivo) para formulários. O <input type="file"> nativo fica invisível
// por cima de todo o componente: clique e teclado continuam nativos. Para área de arrastar-e-soltar com validação
// de tipo/tamanho use UploadDropzone.

/** Estado visual: normal, processando, sucesso ou falha (o processamento é do consumidor). */
export type FileInputStatus = "normal" | "loading" | "success" | "error";

/** fileName: nome exibido (o componente não guarda o arquivo); loading: desabilita e mostra spinner;
 * status: resultado do último processamento. Demais props vão para o <input> nativo (accept, name, required…). */
export interface FileInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "onChange"> {
  fileName?: string | null;
  loading?: boolean;
  status?: Exclude<FileInputStatus, "loading">;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

/** Seletor de arquivo com rótulo de ação que reflete o status (anunciado via aria-live). */
export function FileInput({
  fileName,
  loading = false,
  status = "normal",
  disabled,
  onChange,
  className,
  ...props
}: FileInputProps) {
  const effectiveStatus: FileInputStatus = loading ? "loading" : status;
  const unavailable = disabled || loading;
  const action = effectiveStatus === "loading"
    ? "Processando..."
    : effectiveStatus === "success"
      ? "Processado"
      : effectiveStatus === "error"
        ? "Falha no processamento"
        : "Escolher arquivo";

  return (
    <div
      className={clsx(
        "file-input group relative flex h-auto min-h-10 w-full max-w-full items-stretch overflow-hidden p-0",
        "border-border bg-surface transition-colors hover:border-primary/40",
        "focus-within:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-hover",
        unavailable && "cursor-not-allowed opacity-60",
        effectiveStatus === "success" && "border-success/40",
        effectiveStatus === "error" && "border-danger/40",
        className,
      )}
      aria-busy={loading || undefined}
    >
      <input
        {...props}
        type="file"
        disabled={unavailable}
        onChange={onChange}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        className={clsx(
          "flex min-h-10 shrink-0 items-center gap-2 border-r border-border px-3 text-sm font-semibold",
          effectiveStatus === "success" && "bg-success-soft text-success-text",
          effectiveStatus === "error" && "bg-danger-soft text-danger-text",
          effectiveStatus === "normal" && "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-on-primary",
          effectiveStatus === "loading" && "bg-primary-soft text-primary",
        )}
        aria-live="polite"
      >
        {effectiveStatus === "loading" && (
          <LoaderCircle size={16} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        )}
        {effectiveStatus === "success" && <Check size={16} aria-hidden="true" />}
        {effectiveStatus === "error" && <AlertTriangle size={16} aria-hidden="true" />}
        {action}
      </span>
      <span className="min-w-0 flex-1 truncate px-3 py-2 text-sm text-foreground-muted" title={fileName || "Nenhum arquivo selecionado"}>
        {fileName || "Nenhum arquivo selecionado"}
      </span>
    </div>
  );
}
