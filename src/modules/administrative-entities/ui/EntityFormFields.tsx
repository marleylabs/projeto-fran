"use client";

// Campos do cadastro de entidade administrativa (criar/editar). SÓ APRESENTAÇÃO: máscara/validação de CNPJ, a escolha
// explícita SIM/NÃO para Projeta e Boinga e o envio ficam na página; o servidor normaliza e valida tudo de novo.
// Área de atuação e localidade continuam texto livre com sugestões dos valores já existentes (não são renomeados).
import type { FormEvent } from "react";
import { Field, TextInput, textInputClassName } from "@/components/ui";
import type { AdministrativeEntityForm } from "./types";

// formId liga o form aos botões do rodapé do Dialog (fora do form). cnpjError/choiceError vêm da validação da página.
type Props = {
  formId: string;
  form: AdministrativeEntityForm;
  activityAreas: string[];
  localities: string[];
  cnpjError?: string;
  choiceError?: string;
  onChange: (patch: Partial<AdministrativeEntityForm>) => void;
  onCnpjChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

// Formulário controlado: cada campo devolve um patch parcial em onChange; o CNPJ tem callback próprio (máscara na página).
// SIM/NÃO começa em "Selecione" ("") para obrigar escolha explícita; choiceError só aparece no campo ainda vazio.
export function EntityFormFields({ formId, form, activityAreas, localities, cnpjError, choiceError, onChange, onCnpjChange, onSubmit }: Props) {
  const yesNo = (key: "appliesProjeta" | "appliesBoinga", label: string) => (
    <Field label={label} required error={form[key] === "" ? choiceError : undefined}>
      {(control) => (
        <select {...control} required className={textInputClassName} value={form[key]} onChange={(event) => onChange({ [key]: event.target.value as AdministrativeEntityForm[typeof key] })}>
          <option value="">Selecione</option><option value="true">SIM</option><option value="false">NÃO</option>
        </select>
      )}
    </Field>
  );
  return (
    <form id={formId} onSubmit={onSubmit} className="grid gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-label text-foreground-muted">Identificação</legend>
        <Field label="Razão social" required className="sm:col-span-2">{(control) => <TextInput {...control} required value={form.legalName} onChange={(event) => onChange({ legalName: event.target.value })} />}</Field>
        <Field label="Nome fantasia" required>{(control) => <TextInput {...control} required value={form.tradeName} onChange={(event) => onChange({ tradeName: event.target.value })} />}</Field>
        <Field label="CNPJ" helper="Opcional." error={cnpjError}>{(control) => <TextInput {...control} inputMode="numeric" placeholder="00.000.000/0000-00" className="tabular-nums" value={form.cnpj} onChange={(event) => onCnpjChange(event.target.value)} />}</Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-label text-foreground-muted">Classificação</legend>
        <Field label="Área de atuação" required helper="Usada pelos módulos para filtrar fornecedores (ex.: Alimentação, Café, Cesta).">
          {(control) => <><TextInput {...control} required list="activity-area-options" value={form.activityArea} onChange={(event) => onChange({ activityArea: event.target.value })} /><datalist id="activity-area-options">{activityAreas.map((value) => <option key={value} value={value} />)}</datalist></>}
        </Field>
        <Field label="Localidade" required helper="Ex.: MA, PA ou MA/PA.">
          {(control) => <><TextInput {...control} required list="locality-options" value={form.locality} onChange={(event) => onChange({ locality: event.target.value })} /><datalist id="locality-options">{localities.map((value) => <option key={value} value={value} />)}</datalist></>}
        </Field>
        {yesNo("appliesProjeta", "Projeta")}
        {yesNo("appliesBoinga", "Boinga")}
      </fieldset>
    </form>
  );
}
