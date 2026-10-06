"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { AlertCircle } from "lucide-react";
import clsx from "clsx";

// Campo de formulário acessível: rótulo REAL (label/for) + controle + texto de ajuda + mensagem de erro.
// O controle recebe por render-prop o id, aria-describedby (ajuda/erro) e aria-invalid — nunca só cor.
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
};

export type FieldProps = {
  label: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
};

export function Field({ label, children, helper, error, required, id, className }: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const helperId = helper ? `${controlId}-helper` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={clsx("grid gap-1.5", className)}>
      <label htmlFor={controlId} className="text-label text-foreground">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger-text">*</span>
            <span className="sr-only"> (obrigatório)</span>
          </>
        )}
      </label>
      {children({ id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      {helper && !error && <p id={helperId} className="text-caption text-foreground-muted">{helper}</p>}
      {helper && error && <p id={helperId} className="sr-only">{helper}</p>}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-caption font-medium text-danger-text">
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// Input padrão do Design System (altura 40px, raio 8px). Somente leitura = valor calculado (fundo calc-surface).
export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export const textInputClassName =
  "h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-foreground-muted hover:border-neutral-medium focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-[invalid=true]:border-danger read-only:border-border read-only:bg-calc-surface disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-foreground-muted motion-reduce:transition-none";

export function TextInput({ className, ref, ...props }: TextInputProps) {
  return <input ref={ref} className={clsx(textInputClassName, className)} {...props} />;
}
