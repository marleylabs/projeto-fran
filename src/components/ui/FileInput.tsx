"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";
import clsx from "clsx";

export type FileInputStatus = "normal" | "loading" | "success" | "error";

export interface FileInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "onChange"> {
  fileName?: string | null;
  loading?: boolean;
  status?: Exclude<FileInputStatus, "loading">;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

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
        "border-base-300 bg-base-100 transition-colors hover:border-primary/40",
        "focus-within:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-hover",
        unavailable && "cursor-not-allowed opacity-60",
        effectiveStatus === "success" && "border-success/40",
        effectiveStatus === "error" && "border-error/40",
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
          "flex min-h-10 shrink-0 items-center gap-2 border-r border-base-300 px-3 text-sm font-semibold",
          effectiveStatus === "success" && "bg-success-soft text-success",
          effectiveStatus === "error" && "bg-red-50 text-error",
          effectiveStatus === "normal" && "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-white",
          effectiveStatus === "loading" && "bg-primary-soft text-primary",
        )}
        aria-live="polite"
      >
        {effectiveStatus === "loading" && (
          <span className="loading loading-spinner loading-sm text-primary" aria-hidden="true" />
        )}
        {effectiveStatus === "success" && <span aria-hidden="true">✓</span>}
        {effectiveStatus === "error" && <span aria-hidden="true">⚠</span>}
        {action}
      </span>
      <span className="min-w-0 flex-1 truncate px-3 py-2 text-sm text-secondary" title={fileName || "Nenhum arquivo selecionado"}>
        {fileName || "Nenhum arquivo selecionado"}
      </span>
    </div>
  );
}
