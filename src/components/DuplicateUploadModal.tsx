"use client";

import { AlertCircle, X } from "lucide-react";
import { formatBRNumber } from "@/lib/normalize/money";
import type { DuplicateExisting } from "@/lib/uploadWithProgress";

interface Props {
  existing: DuplicateExisting;
  onReplace: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function DuplicateUploadModal({ existing, onReplace, onKeepBoth, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-warning-soft text-warning-strong flex items-center justify-center shrink-0">
              <AlertCircle className="w-4.5 h-4.5" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Já existe uma extração para este período</h2>
              <p className="text-sm text-text-muted mt-0.5">Encontramos um upload anterior da mesma empresa e competência.</p>
            </div>
          </div>
          <button onClick={onCancel} className="btn btn-ghost btn-sm !p-1.5 -mt-1 -mr-1" aria-label="Fechar">
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5">
          <div className="rounded-lg border border-border bg-surface-soft p-3 text-sm">
            <p className="font-medium text-foreground truncate">{existing.fileName}</p>
            <p className="text-text-muted mt-0.5">
              Enviado em {formatDate(existing.createdAt)} · {existing.totalColaboradores} colaborador(es) · R${" "}
              {formatBRNumber(existing.liquidoGeral)}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-2">
          <button onClick={onReplace} className="btn btn-primary w-full">
            Substituir extração anterior
          </button>
          <button onClick={onKeepBoth} className="btn btn-secondary w-full">
            Manter as duas
          </button>
          <button onClick={onCancel} className="btn btn-ghost w-full">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
