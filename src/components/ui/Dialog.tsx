"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

// Diálogo modal único do Design System, sobre <dialog> nativo (foco preso no modal, Esc e backdrop nativos).
// Acessível: aria-labelledby (título) e aria-describedby (descrição), botão Fechar com nome, devolve o foco
// para quem abriu ao fechar. Estado controlado pelo pai (open/onClose). Não usa .modal/.modal-box do daisyUI.
type DialogSize = "sm" | "md" | "lg";
const sizes: Record<DialogSize, string> = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  /** false impede fechar por Esc/backdrop (ex.: operação em andamento). O botão Fechar também é desabilitado. */
  dismissible?: boolean;
  closeLabel?: string;
  className?: string;
};

export function Dialog({ open, onClose, title, description, children, footer, size = "md", dismissible = true, closeLabel = "Fechar", className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = description ? `${baseId}-description` : undefined;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && dismissible) onClose(); }}
      className={clsx("m-auto w-[calc(100%-2rem)] rounded-modal border border-border bg-surface p-0 text-foreground shadow-elevation-lg backdrop:bg-neutral-dark/50 motion-safe:backdrop:backdrop-blur-[2px]", sizes[size], className)}
    >
      <div className="flex max-h-[min(90vh,52rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-section-title text-foreground">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-body text-foreground-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label={closeLabel}
            className="-mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-body">{children}</div>}
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </dialog>
  );
}
