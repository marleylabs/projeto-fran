"use client";

// Campos do formulário de colaborador (criar/editar), organizados em Dados pessoais, Lotação e Situação. SÓ
// APRESENTAÇÃO: o estado, a máscara/validação do CPF (helpers de @/lib/cpf) e o envio ficam na página; o servidor
// normaliza e valida tudo de novo. Admissão é date-only (input type=date, sem conversão de fuso).
import type { FormEvent, ReactNode } from "react";
import { Field, TextInput } from "@/components/ui";
import type { CollaboratorForm } from "./types";

type Props = {
  formId: string;
  form: CollaboratorForm;
  cpfError: string;
  onChange: (patch: Partial<CollaboratorForm>) => void;
  onCpfChange: (value: string) => void;
  onCpfBlur: () => void;
  onSubmit: (event: FormEvent) => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-label text-foreground-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

export function CollaboratorFormFields({ formId, form, cpfError, onChange, onCpfChange, onCpfBlur, onSubmit }: Props) {
  return (
    <form id={formId} onSubmit={onSubmit} className="grid gap-5">
      <Section title="Dados pessoais">
        <Field label="Nome" required className="sm:col-span-2">{(control) => <TextInput {...control} autoFocus required value={form.officialName} onChange={(event) => onChange({ officialName: event.target.value })} />}</Field>
        <Field label="CPF" error={cpfError || undefined} helper="Opcional. Validado pelos dígitos verificadores.">
          {(control) => <TextInput {...control} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className="tabular-nums" value={form.cpf} onChange={(event) => onCpfChange(event.target.value)} onBlur={onCpfBlur} />}
        </Field>
        <Field label="Data de Admissão" helper="Opcional. Usada pela Cesta Básica.">
          {(control) => <TextInput {...control} type="date" lang="pt-BR" className="tabular-nums" value={form.admissionDate} onChange={(event) => onChange({ admissionDate: event.target.value })} />}
        </Field>
      </Section>
      <Section title="Lotação">
        <Field label="Função" className="sm:col-span-2">{(control) => <TextInput {...control} value={form.jobTitle} onChange={(event) => onChange({ jobTitle: event.target.value })} />}</Field>
        <Field label="Departamento" required>{(control) => <TextInput {...control} required value={form.department} onChange={(event) => onChange({ department: event.target.value })} />}</Field>
        <Field label="Centro de Custo" helper="Mudanças valem para lançamentos futuros; históricos guardam o valor do lançamento.">{(control) => <TextInput {...control} value={form.costCenter} onChange={(event) => onChange({ costCenter: event.target.value })} />}</Field>
      </Section>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-label text-foreground-muted">Situação</legend>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-body">
          <input type="checkbox" className="toggle toggle-primary" checked={form.active} onChange={(event) => onChange({ active: event.target.checked })} />
          {form.active ? "Ativo" : "Inativo"}
          <span className="text-caption text-foreground-muted">· inativos não aparecem em novos lançamentos</span>
        </label>
      </fieldset>
    </form>
  );
}
