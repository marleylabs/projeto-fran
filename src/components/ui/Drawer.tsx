"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

// Painel lateral (drawer) sobre <dialog> nativo com showModal(): foco preso no painel (inert no resto da página),
// Esc fecha, clique no overlay fecha e o foco volta para quem abriu. Estado controlado pelo pai (open/onClose).
// Mesmos princípios de acessibilidade do Dialog: aria-labelledby (título visível ou sr-only) e botão Fechar com nome.
export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** true = título só para leitores de tela (o conteúdo já identifica o painel visualmente). */
  hideTitle?: boolean;
  side?: "left" | "right";
  children: ReactNode;
  closeLabel?: string;
  className?: string;
};

export function Drawer({ open, onClose, title, hideTitle = false, side = "left", children, closeLabel = "Fechar", className }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = `${useId()}-drawer-title`;

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
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={clsx(
        "fixed inset-y-0 m-0 h-dvh max-h-none w-[min(18rem,86vw)] max-w-none border-border bg-surface p-0 text-foreground shadow-elevation-lg backdrop:bg-neutral-dark/50",
        side === "left" ? "left-0 right-auto border-r" : "left-auto right-0 border-l",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <div className={clsx("flex items-center justify-between gap-3 px-4 pt-3", hideTitle && "justify-end")}>
          <h2 id={titleId} className={clsx("text-section-title", hideTitle && "sr-only")}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="grid size-9 cursor-pointer place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
