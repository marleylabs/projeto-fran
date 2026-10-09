"use client";

// Campos do treinamento (criar e editar). SÓ APRESENTAÇÃO: envio, payload e validação ficam na página e no servidor.
// Valores monetários: CurrencyInput sobre o TEXTO decimal do formulário (ponte em ./format), sem recalcular nada.
import type { ReactNode } from "react";
import { CurrencyInput, Field, TextInput } from "@/components/ui";
import { currencyText, currencyValue } from "./format";
import type { TrainingForm } from "./types";

export function TrainingFormFields<F extends TrainingForm>({ form, onChange, required = false, before }: { form: F; onChange: (patch: Partial<F>) => void; required?: boolean; before?: ReactNode }) {
  const set = (patch: Partial<TrainingForm>) => onChange(patch as Partial<F>);
  const currency = (key: "additionalStudentPrice" | "unitPrice" | "totalPrice", label: string) => (
    <Field label={`${label} (R$)`} required={required}>{(control) => <CurrencyInput {...control} required={required} value={currencyValue(form[key])} onValueChange={(value) => set({ [key]: currencyText(value) })} />}</Field>
  );
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-label text-foreground-muted">Identificação</legend>
        {before}
        <Field label="Descrição" required={required} className="sm:col-span-2">{(control) => <TextInput {...control} required={required} value={form.description} onChange={(event) => set({ description: event.target.value })} />}</Field>
        <Field label="Modalidade" required={required}>{(control) => <TextInput {...control} required={required} value={form.modality} onChange={(event) => set({ modality: event.target.value })} />}</Field>
        <Field label="Forma de atendimento" required={required}>{(control) => <TextInput {...control} required={required} value={form.attendanceType} onChange={(event) => set({ attendanceType: event.target.value })} />}</Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-label text-foreground-muted">Valores da proposta</legend>
        <Field label="Quantidade base" required={required} helper="Alunos incluídos no valor unitário.">{(control) => <TextInput {...control} type="number" min={1} required={required} inputMode="numeric" className="tabular-nums" value={form.quantity} onChange={(event) => set({ quantity: event.target.value })} />}</Field>
        {currency("unitPrice", "Valor unitário")}
        {currency("additionalStudentPrice", "Valor adicional por aluno")}
        {currency("totalPrice", "Valor total")}
      </fieldset>
    </div>
  );
}
