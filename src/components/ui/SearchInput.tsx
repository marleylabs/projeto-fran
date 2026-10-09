"use client";

import { useId, useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { textInputClassName } from "./Field";

// Busca controlada pelo consumidor (value/onValueChange). Rótulo REAL sempre presente (visível ou sr-only) — o
// placeholder é só exemplo, nunca o rótulo. Botão "Limpar busca" aparece quando há valor; Esc também limpa.
// Sem largura fixa: ocupa o espaço que o contêiner der (FilterBar define a base flexível).
export type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "className"> & {
  label: string;
  /** true (padrão) = rótulo só para leitores de tela; false = rótulo visível acima do campo. */
  hideLabel?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  clearLabel?: string;
  className?: string;
};

export function SearchInput({ label, hideLabel = true, value, onValueChange, clearLabel = "Limpar busca", id, className, disabled, onKeyDown, ...props }: SearchInputProps) {
  const generated = useId();
  const inputId = id ?? `search-${generated}`;
  const input = useRef<HTMLInputElement>(null);
  const clear = () => { onValueChange(""); input.current?.focus(); };
  return (
    <div className={clsx("grid min-w-0 gap-1.5", className)}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "text-label text-foreground"}>{label}</label>
      <div className="relative">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
        <input
          ref={input}
          id={inputId}
          type="search"
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            // Esc com texto: limpa a busca (e não fecha um Dialog/Drawer ao redor). Sem texto, segue o padrão.
            if (event.key === "Escape" && value) { event.preventDefault(); event.stopPropagation(); onValueChange(""); }
            onKeyDown?.(event);
          }}
          className={clsx(textInputClassName, "pl-9", value && "pr-10", "[&::-webkit-search-cancel-button]:appearance-none")}
          {...props}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label={clearLabel}
            className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground motion-reduce:transition-none"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
