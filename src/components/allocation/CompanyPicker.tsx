"use client";
/* eslint-disable react-hooks/set-state-in-effect -- abrir o modal reseta o próprio formulário */
// Cadastro mestre de Company (empresa do rateio) — compartilhado entre módulos que usam Company
// como fonte da empresa (Vale Transporte, Café da Manhã, Cesta Básica). Extraído para não duplicar a
// experiência já aprovada do Vale Transporte. Fase 7G: só o visual migrou para o Dialog da foundation;
// campos, validação de CNPJ, POST em /api/master-data/companies e onCreated continuam os mesmos (a empresa
// padrão de cada colaborador segue sendo gravada pelos lançamentos, nunca por este modal).
import { FormEvent, useEffect, useId, useState } from "react";
import { Button, Dialog, FeedbackAlert, Field, TextInput } from "@/components/ui";
import { formatCnpj, isValidCnpj } from "@/modules/administrative-entities/schema";

export type Company = { id: string; legalName: string; tradeName: string | null; active: boolean };
export const companyLabel = (company: Company) => company.tradeName?.trim() || company.legalName;
export const normalizeText = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function CompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (company: Company) => void }) {
  const formId = `${useId()}-company`;
  const [legalName, setLegalName] = useState(""); const [tradeName, setTradeName] = useState(""); const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setLegalName(""); setTradeName(""); setTaxId(""); setError(null); } }, [open]);
  async function submit(event: FormEvent) {
    event.preventDefault(); const digits = taxId.replace(/\D/g, "");
    if (!isValidCnpj(digits)) return setError("Informe um CNPJ válido.");
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/master-data/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legalName, tradeName, taxId: digits }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível cadastrar a empresa.");
      onCreated(body.item); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar a empresa."); } finally { setBusy(false); }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title="Cadastrar empresa"
      description="Empresa do rateio (cadastro mestre). Fica disponível para todos os colaboradores."
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" form={formId} loading={busy} disabled={busy}>Cadastrar</Button></>}
    >
      <form id={formId} onSubmit={submit} className="grid gap-3">
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        <Field label="Razão social" required>{(control) => <TextInput {...control} required value={legalName} onChange={(event) => setLegalName(event.target.value)} />}</Field>
        <Field label="Nome fantasia (exibido)" required>{(control) => <TextInput {...control} required value={tradeName} onChange={(event) => setTradeName(event.target.value)} placeholder="PROJETA" />}</Field>
        <Field label="CNPJ" required>{(control) => <TextInput {...control} required inputMode="numeric" className="tabular-nums" value={taxId.length === 14 ? formatCnpj(taxId) : taxId} onChange={(event) => setTaxId(event.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Somente números" />}</Field>
      </form>
    </Dialog>
  );
}
