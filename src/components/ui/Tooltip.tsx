"use client";

import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

// Tooltip acessível (substituto futuro de title="..." em informações importantes).
// - Abre com hover E com foco (teclado); Esc fecha sem mover o foco; o balão pode ser "visitado" pelo ponteiro.
// - O texto fica SEMPRE no DOM (span sr-only ao lado do gatilho) e é ligado por aria-describedby, então leitores de
//   tela o anunciam mesmo sem hover. O balão visual vai para um portal (position: fixed) para não ser cortado por
//   contêineres com overflow (ex.: tabelas com scroll horizontal) e é aria-hidden (evita leitura duplicada).
// - O gatilho deve ser um elemento focável (button, link, input) que aceite aria-describedby.
export type TooltipSide = "top" | "bottom";

type Rect = { top: number; left: number; bottom: number; width: number };

/** Posição do balão: centralizado no gatilho, preso à viewport (margem 8px); inverte o lado se não couber. */
export function tooltipPosition(trigger: Rect, bubble: { width: number; height: number }, viewport: { width: number; height: number }, side: TooltipSide = "top", gap = 6) {
  const fitsTop = trigger.top - gap - bubble.height >= 8;
  const fitsBottom = trigger.bottom + gap + bubble.height <= viewport.height - 8;
  const placement: TooltipSide = side === "top" ? (fitsTop || !fitsBottom ? "top" : "bottom") : (fitsBottom || !fitsTop ? "bottom" : "top");
  const top = placement === "top" ? trigger.top - gap - bubble.height : trigger.bottom + gap;
  const centered = trigger.left + trigger.width / 2 - bubble.width / 2;
  const left = Math.max(8, Math.min(viewport.width - bubble.width - 8, centered));
  return { top: Math.round(top), left: Math.round(left), placement };
}

export type TooltipProps = {
  content: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: TooltipSide;
  /** Atraso de abertura no hover (ms). Foco abre imediatamente. */
  delay?: number;
  className?: string;
};

export function Tooltip({ content, children, side = "top", delay = 300, className }: TooltipProps) {
  const id = `${useId()}-tooltip`;
  const wrapper = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);

  const clearTimers = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); };
  const show = useCallback((wait: number) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    // Dentro de um <dialog> modal o balão precisa ficar no próprio dialog (top layer); fora dele, no body.
    setPortalRoot(wrapper.current?.closest("dialog") ?? document.body);
    openTimer.current = setTimeout(() => setOpen(true), wait);
  }, []);
  // Pequeno atraso ao fechar: permite levar o ponteiro do gatilho até o balão (WCAG 1.4.13 "hoverable").
  const hide = useCallback(() => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => { setOpen(false); setPosition(null); }, 100);
  }, []);

  useEffect(() => clearTimers, []);

  // Mede o gatilho e o balão e reposiciona (abertura, rolagem e redimensionamento — inclusive a rolagem que o
  // próprio foco provoca ao levar o gatilho para a área visível).
  const reposition = useCallback(() => {
    if (!wrapper.current || !bubble.current) return;
    const target = (wrapper.current.firstElementChild as HTMLElement | null) ?? wrapper.current;
    const size = bubble.current.getBoundingClientRect();
    setPosition(tooltipPosition(target.getBoundingClientRect(), { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }, side));
  }, [side]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { clearTimers(); setOpen(false); setPosition(null); } };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open, reposition]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  return (
    <span
      ref={wrapper}
      className={clsx("relative inline-flex", className)}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") show(delay); }}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span id={id} className="sr-only">{content}</span>
      {open && portalRoot && createPortal(
        <div
          ref={bubble}
          aria-hidden="true"
          data-tooltip=""
          onPointerEnter={() => clearTimeout(closeTimer.current)}
          onPointerLeave={hide}
          style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
          className="fixed z-50 max-w-xs rounded-control bg-foreground px-2.5 py-1.5 text-caption font-medium text-surface shadow-elevation-md"
        >
          {content}
        </div>,
        portalRoot,
      )}
    </span>
  );
}
