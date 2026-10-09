"use client";

// Interruptor liga/desliga (Fase 7J), no lugar do `toggle` do daisyUI. Responsabilidade SÓ de interface: o módulo
// controla `checked` e decide o efeito de onCheckedChange (nenhuma regra aqui).
// Acessível: <button role="switch" aria-checked>, nome pelo rótulo visível (aria-labelledby), descrição opcional por
// aria-describedby, foco visível global, Espaço/Enter nativos do botão, `disabled` real.
import { useId, type ReactNode } from "react";
import clsx from "clsx";

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function Switch({ checked, onCheckedChange, label, description, disabled = false, id, className }: SwitchProps) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const labelId = `${baseId}-label`, descriptionId = `${baseId}-description`;
  return (
    <div className={clsx("flex items-start gap-3", className)}>
      <button
        id={baseId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={clsx(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-primary bg-primary" : "border-border-strong bg-surface-muted",
        )}
      >
        <span aria-hidden="true" className={clsx("inline-block size-4 rounded-full bg-surface shadow-elevation-sm transition-transform motion-reduce:transition-none", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
      <span className="grid min-w-0 gap-0.5">
        <label id={labelId} htmlFor={baseId} className={clsx("text-body font-medium", disabled ? "cursor-not-allowed text-foreground-muted" : "cursor-pointer")}>{label}</label>
        {description && <span id={descriptionId} className="text-caption text-foreground-muted">{description}</span>}
      </span>
    </div>
  );
}
