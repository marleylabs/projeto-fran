"use client";

// Upload duplicado (mesma empresa e competência já extraídas). SÓ APRESENTAÇÃO: as três decisões (substituir, manter as
// duas, cancelar) voltam ao PayrollWorkspace, que reenvia o arquivo com duplicateAction como antes. Esc/fechar = cancelar.
import { Button, Dialog } from "@/components/ui";
import type { DuplicateExisting } from "@/lib/uploadWithProgress";
import { brl } from "./format";

const formatDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function PayrollDuplicateDialog({ existing, onReplace, onKeepBoth, onCancel }: { existing: DuplicateExisting | null; onReplace: () => void; onKeepBoth: () => void; onCancel: () => void }) {
  return (
    <Dialog
      open={Boolean(existing)}
      onClose={onCancel}
      title="Já existe uma extração para este período"
      description="Encontramos um upload anterior da mesma empresa e competência."
      footer={<><Button variant="ghost" onClick={onCancel}>Cancelar</Button><Button variant="secondary" onClick={onKeepBoth}>Manter as duas</Button><Button aura onClick={onReplace}>Substituir extração anterior</Button></>}
    >
      {existing && (
        <dl className="grid gap-1 rounded-control border border-border bg-surface-muted/60 p-3 text-body">
          <div><dt className="sr-only">Arquivo</dt><dd className="break-words font-medium">{existing.fileName}</dd></div>
          <div className="flex flex-wrap gap-x-3 text-foreground-muted tabular-nums">
            <div className="flex gap-1"><dt>Enviado em</dt><dd>{formatDate(existing.createdAt)}</dd></div>
            <div className="flex gap-1"><dt>Colaboradores</dt><dd>{existing.totalColaboradores}</dd></div>
            <div className="flex gap-1"><dt>Líquido</dt><dd>{brl(existing.liquidoGeral)}</dd></div>
          </div>
        </dl>
      )}
    </Dialog>
  );
}
