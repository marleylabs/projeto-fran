"use client";

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
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-foreground">Já existe uma extração para este período</h2>
        <p className="text-sm text-text-muted mt-2">
          Encontramos um upload anterior da mesma empresa e competência:
        </p>

        <div className="mt-3 rounded-md border border-border bg-surface-soft p-3 text-sm">
          <p className="font-medium text-foreground">{existing.fileName}</p>
          <p className="text-text-muted">
            Enviado em {formatDate(existing.createdAt)} · {existing.totalColaboradores} colaborador(es) · R${" "}
            {formatBRNumber(existing.liquidoGeral)}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onReplace}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Substituir extração anterior
          </button>
          <button
            onClick={onKeepBoth}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-soft"
          >
            Manter as duas
          </button>
          <button onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:text-foreground">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
