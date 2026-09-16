"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <div className="modal-box border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">{title}</h2>
        <p className="mt-2 text-sm text-secondary">{description}</p>
        <div className="modal-action">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "error" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Fechar modal">Fechar</button>
      </form>
    </dialog>
  );
}
