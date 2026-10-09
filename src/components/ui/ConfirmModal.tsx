"use client";

// Confirmação SIMPLES (sim/não). Fase 7M: usa o Dialog da fundação (foco preso no <dialog> nativo, Esc, retorno de foco
// a quem abriu, rolagem interna, largura móvel) — API pública inalterada. Não é o DeletionModal (exclusão com motivo e
// palavra-chave) nem um formulário. Durante `busy` não fecha por Esc/backdrop/Fechar (o Dialog bloqueia).
import { Button } from "./Button";
import { Dialog } from "./Dialog";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  busy = false,
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  description,
  destructive = false,
  onClose,
  onConfirm,
  open,
  title,
}: ConfirmModalProps) {
  return (
    <Dialog
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      dismissible={!busy}
      size="sm"
      title={title}
      description={description}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "error" : "primary"} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </>}
    />
  );
}
