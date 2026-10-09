"use client";

import { useState, type InputHTMLAttributes, type Ref } from "react";
import clsx from "clsx";
import { textInputClassName } from "./Field";

// Entrada monetária (pt-BR, prefixo R$). Responsabilidade SÓ de interface: digitação, formatação e estados.
// - Controlada: `value` (number | null) é do módulo; a cada digitação válida chama onValueChange(número, texto).
//   Ao sair do campo, mostra o `value` que o módulo mantiver (se ele rejeitar a mudança, o campo reflete isso).
// - Sem arredondamento silencioso: digitação com mais casas que `fractionDigits` é RECUSADA (o texto não muda) e a
//   formatação nunca corta casas de um valor recebido.
// - Nenhuma regra financeira aqui (limites, tetos, rateios ficam no módulo/backend).
// Integra com Field: <Field label="Valor">{(control) => <CurrencyInput {...control} value={v} onValueChange={...} />}</Field>

/** Texto digitado → número. "" → null. Aceita "1.234,56", "1234,56", "1234.5" (ponto como decimal só sem vírgula e
 *  com até `fractionDigits` casas após o último ponto). Retorna undefined quando o texto não é um valor válido. */
export function parseCurrencyInput(text: string, { fractionDigits = 2, allowNegative = false } = {}): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-");
  if (negative && !allowNegative) return undefined;
  const body = negative ? trimmed.slice(1) : trimmed;
  if (!body || !/^[\d.,]+$/.test(body)) return undefined;
  let integer: string;
  let fraction = "";
  if (body.includes(",")) {
    const parts = body.split(",");
    if (parts.length > 2) return undefined;
    [integer, fraction] = parts;
    if (!/^(\d{1,3}(\.\d{3})*|\d*)$/.test(integer)) return undefined;
    integer = integer.replaceAll(".", "");
  } else {
    const lastDot = body.lastIndexOf(".");
    const tail = lastDot >= 0 ? body.slice(lastDot + 1) : "";
    // "1.234" é milhar (3 dígitos); "12.5" é decimal. Com vários pontos, todos são milhar.
    if (lastDot >= 0 && body.indexOf(".") === lastDot && tail.length !== 3) {
      integer = body.slice(0, lastDot);
      fraction = tail;
    } else {
      if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(body)) return undefined;
      integer = body.replaceAll(".", "");
    }
  }
  if (!/^\d*$/.test(integer) || !/^\d*$/.test(fraction)) return undefined;
  if (fraction.length > fractionDigits) return undefined;
  const value = Number(`${integer || "0"}.${fraction || "0"}`);
  return negative ? -value : value;
}

/** Número → texto pt-BR com pelo menos `fractionDigits` casas e SEM cortar casas existentes. */
export function formatCurrencyInput(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: fractionDigits, maximumFractionDigits: 20, useGrouping: true });
}

/** Digitação aceita? (caracteres permitidos + casas decimais dentro do limite). Texto parcial como "12," é aceito. */
export function isAcceptableCurrencyDraft(text: string, { fractionDigits = 2, allowNegative = false } = {}) {
  if (text === "" || (allowNegative && text === "-")) return true;
  const pattern = allowNegative ? /^-?[\d.,]*$/ : /^[\d.,]*$/;
  if (!pattern.test(text)) return false;
  if ((text.match(/,/g) ?? []).length > 1) return false;
  const comma = text.indexOf(",");
  if (comma >= 0 && text.length - comma - 1 > fractionDigits) return false;
  return true;
}

export type CurrencyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "inputMode"> & {
  value: number | null;
  onValueChange: (value: number | null, text: string) => void;
  fractionDigits?: number;
  allowNegative?: boolean;
  /** Prefixo visual (padrão "R$"). A moeda deve constar no rótulo do Field para leitores de tela. */
  prefix?: string;
  align?: "left" | "right";
  ref?: Ref<HTMLInputElement>;
};

export function CurrencyInput({ value, onValueChange, fractionDigits = 2, allowNegative = false, prefix = "R$", align = "right", className, onFocus, onBlur, placeholder, ref, ...props }: CurrencyInputProps) {
  // null = não está editando (mostra o valor do módulo formatado). Durante a edição mostra exatamente o que foi digitado.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatCurrencyInput(value, fractionDigits);
  const options = { fractionDigits, allowNegative };
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-foreground-muted">{prefix}</span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        placeholder={placeholder ?? formatCurrencyInput(0, fractionDigits)}
        onFocus={(event) => { setDraft(formatCurrencyInput(value, fractionDigits)); onFocus?.(event); }}
        onChange={(event) => {
          const text = event.target.value;
          if (!isAcceptableCurrencyDraft(text, options)) return;
          setDraft(text);
          const parsed = parseCurrencyInput(text, options);
          // Texto parcial/ambíguo (ex.: "-", "1.2.3"): mantém o rascunho, mas não envia número inválido ao módulo.
          if (parsed !== undefined) onValueChange(parsed, text);
        }}
        onBlur={(event) => { setDraft(null); onBlur?.(event); }}
        className={clsx(textInputClassName, "pl-10 tabular-nums", align === "right" && "text-right", className)}
        {...props}
      />
    </div>
  );
}
