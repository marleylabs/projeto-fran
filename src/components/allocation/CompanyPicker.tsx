"use client";
/* eslint-disable react-hooks/set-state-in-effect -- o modal abre/fecha via <dialog> nativo e reseta seu próprio formulário */
// Cadastro mestre de Company (empresa do rateio) — compartilhado entre módulos que usam Company
// como fonte da empresa (Vale Transporte, Café da Manhã, futuros). Extraído para não duplicar a
// experiência já aprovada do Vale Transporte.
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { formatCnpj, isValidCnpj } from "@/modules/administrative-entities/schema";

export type Company = { id: string; legalName: string; tradeName: string | null; active: boolean };
export const companyLabel = (company: Company) => company.tradeName?.trim() || company.legalName;
export const normalizeText = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function CompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (company: Company) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [legalName, setLegalName] = useState(""); const [tradeName, setTradeName] = useState(""); const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { const dialog = dialogRef.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); if (open) { setLegalName(""); setTradeName(""); setTaxId(""); setError(null); } }, [open]);
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
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <form onSubmit={submit} className="modal-box max-w-md border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">Cadastrar empresa</h2>
        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-4 grid gap-3">
          <label className="form-control"><span className="label-text mb-1">Razão social *</span><input required className="input input-bordered w-full" value={legalName} onChange={(event) => setLegalName(event.target.value)} /></label>
          <label className="form-control"><span className="label-text mb-1">Nome fantasia (exibido) *</span><input required className="input input-bordered w-full" value={tradeName} onChange={(event) => setTradeName(event.target.value)} placeholder="PROJETA" /></label>
          <label className="form-control"><span className="label-text mb-1">CNPJ *</span><input required inputMode="numeric" className="input input-bordered w-full" value={taxId.length === 14 ? formatCnpj(taxId) : taxId} onChange={(event) => setTaxId(event.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Somente números" /></label>
        </div>
        <div className="modal-action"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" loading={busy} disabled={busy}>Cadastrar</Button></div>
      </form>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar">Fechar</button></form>
    </dialog>
  );
}
