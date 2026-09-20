"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CorporateHeader } from "@/components/CorporateHeader";
import { Badge, Button, EmptyState, FilterBar, MetricCard, PageHeader } from "@/components/ui";

type Training = {
  id: string;
  description: string;
  trainingType: string | null;
  duration: string | null;
  modality: string;
  attendanceType: string;
  additionalStudentPrice: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  active: boolean;
  origin: "IMPORTED" | "MANUAL";
  supplier: { id: string; legalName: string; tradeName: string };
  proposal: { id: string; proposalNumber: string; proposalDate: string | null } | null;
};

type Supplier = { id: string; tradeName: string };
type Proposal = { id: string; proposalNumber: string };

const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const dateBr = (value: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function mostFrequent(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

type EditForm = { description: string; modality: string; attendanceType: string; additionalStudentPrice: string; quantity: string; unitPrice: string; totalPrice: string };

function toEditForm(item: Training): EditForm {
  return {
    description: item.description,
    modality: item.modality,
    attendanceType: item.attendanceType,
    additionalStudentPrice: item.additionalStudentPrice,
    quantity: String(item.quantity),
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  };
}

function TrainingModal({
  item,
  canManage,
  onClose,
  onSaved,
}: {
  item: Training | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
    setEditing(false);
    setError(null);
    setForm(item ? toEditForm(item) : null);
  }, [item]);

  if (!item) {
    return <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose} />;
  }

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/trainings/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          modality: form.modality,
          attendanceType: form.attendanceType,
          additionalStudentPrice: form.additionalStudentPrice.replace(",", "."),
          unitPrice: form.unitPrice.replace(",", "."),
          totalPrice: form.totalPrice.replace(",", "."),
          quantity: Number(form.quantity),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao salvar o treinamento.");
      onSaved();
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar o treinamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <div className="modal-box max-w-2xl border border-base-300 bg-base-100">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-neutral">{editing ? "Editar treinamento" : "Detalhe do treinamento"}</h2>
          <div className="flex gap-2">
            <Badge tone={item.origin === "IMPORTED" ? "info" : "neutral"}>{item.origin === "IMPORTED" ? "Importado" : "Manual"}</Badge>
            <Badge tone={item.active ? "success" : "neutral"}>{item.active ? "Ativo" : "Inativo"}</Badge>
          </div>
        </div>

        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}

        {editing && form ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="form-control sm:col-span-2"><span className="label-text mb-1">Descrição</span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input input-bordered w-full" /></label>
            <label className="form-control"><span className="label-text mb-1">Modalidade</span><input value={form.modality} onChange={(event) => setForm({ ...form, modality: event.target.value })} className="input input-bordered w-full" /></label>
            <label className="form-control"><span className="label-text mb-1">Forma de atendimento</span><input value={form.attendanceType} onChange={(event) => setForm({ ...form, attendanceType: event.target.value })} className="input input-bordered w-full" /></label>
            <label className="form-control"><span className="label-text mb-1">Quantidade</span><input type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className="input input-bordered w-full" /></label>
            <label className="form-control"><span className="label-text mb-1">Valor adicional/aluno</span><input value={form.additionalStudentPrice} onChange={(event) => setForm({ ...form, additionalStudentPrice: event.target.value })} className="input input-bordered w-full" /></label>
            <label className="form-control"><span className="label-text mb-1">Valor unitário</span><input value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} className="input input-bordered w-full" /></label>
            <label className="form-control"><span className="label-text mb-1">Valor total</span><input value={form.totalPrice} onChange={(event) => setForm({ ...form, totalPrice: event.target.value })} className="input input-bordered w-full" /></label>
          </div>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-text-muted">Descrição</dt><dd className="font-medium">{item.description}</dd></div>
            <div><dt className="text-text-muted">Fornecedor</dt><dd className="font-medium">{item.supplier.tradeName}</dd></div>
            <div><dt className="text-text-muted">Proposta</dt><dd className="font-medium">{item.proposal ? `Nº ${item.proposal.proposalNumber}` : "Sem proposta (cadastro manual)"}</dd></div>
            <div><dt className="text-text-muted">Data da proposta</dt><dd className="font-medium">{item.proposal ? dateBr(item.proposal.proposalDate) : "—"}</dd></div>
            <div><dt className="text-text-muted">Modalidade</dt><dd className="font-medium">{item.modality}</dd></div>
            <div><dt className="text-text-muted">Forma de atendimento</dt><dd className="font-medium">{item.attendanceType}</dd></div>
            <div><dt className="text-text-muted">Valor adicional por aluno</dt><dd className="font-medium">{money(item.additionalStudentPrice)}</dd></div>
            <div><dt className="text-text-muted">Quantidade base</dt><dd className="font-medium">{item.quantity}</dd></div>
            <div><dt className="text-text-muted">Valor unitário</dt><dd className="font-medium">{money(item.unitPrice)}</dd></div>
            <div><dt className="text-text-muted">Total original</dt><dd className="font-medium">{money(item.totalPrice)}</dd></div>
          </dl>
        )}

        <div className="modal-action">
          {canManage && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>}
          {editing && <Button variant="secondary" onClick={() => { setEditing(false); setForm(toEditForm(item)); }} disabled={saving}>Cancelar edição</Button>}
          {editing && <Button onClick={save} loading={saving} disabled={saving}>Salvar</Button>}
          {!editing && <Button variant="secondary" onClick={onClose}>Fechar</Button>}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar modal" onClick={onClose}>Fechar</button></form>
    </dialog>
  );
}

type NewTrainingForm = {
  supplierId: string;
  proposalId: string;
  description: string;
  trainingType: string;
  duration: string;
  modality: string;
  attendanceType: string;
  additionalStudentPrice: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  active: "true" | "false";
};

const EMPTY_NEW_TRAINING: NewTrainingForm = {
  supplierId: "",
  proposalId: "",
  description: "",
  trainingType: "",
  duration: "",
  modality: "PRESENCIAL",
  attendanceType: "EM TURMA",
  additionalStudentPrice: "",
  quantity: "1",
  unitPrice: "",
  totalPrice: "",
  active: "true",
};

function NewTrainingModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [form, setForm] = useState<NewTrainingForm>(EMPTY_NEW_TRAINING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      setForm(EMPTY_NEW_TRAINING);
      setError(null);
      fetch("/api/administrative-entities").then((response) => response.json()).then((body) => setSuppliers(body.items ?? [])).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!form.supplierId) { setProposals([]); return; }
      fetch(`/api/training-proposals?supplierId=${form.supplierId}`).then((response) => response.json()).then((body) => setProposals(body.items ?? [])).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [form.supplierId]);

  if (!open) return <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose} />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/trainings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: form.supplierId,
          proposalId: form.proposalId || null,
          description: form.description,
          trainingType: form.trainingType || null,
          duration: form.duration || null,
          modality: form.modality,
          attendanceType: form.attendanceType,
          additionalStudentPrice: form.additionalStudentPrice.replace(",", "."),
          quantity: Number(form.quantity),
          unitPrice: form.unitPrice.replace(",", "."),
          totalPrice: form.totalPrice.replace(",", "."),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao criar o treinamento.");
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao criar o treinamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <form onSubmit={submit} className="modal-box max-w-2xl border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">Novo treinamento</h2>
        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="form-control sm:col-span-2">
            <span className="label-text mb-1">Fornecedor</span>
            <select required value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value, proposalId: "" })} className="select select-bordered w-full">
              <option value="">Selecione um fornecedor cadastrado</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName}</option>)}
            </select>
          </label>
          <label className="form-control sm:col-span-2">
            <span className="label-text mb-1">Proposta <span className="text-text-muted">(opcional)</span></span>
            <select value={form.proposalId} onChange={(event) => setForm({ ...form, proposalId: event.target.value })} className="select select-bordered w-full" disabled={!form.supplierId}>
              <option value="">Sem proposta comercial formal</option>
              {proposals.map((proposal) => <option key={proposal.id} value={proposal.id}>Nº {proposal.proposalNumber}</option>)}
            </select>
          </label>
          <label className="form-control sm:col-span-2"><span className="label-text mb-1">Descrição</span><input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Tipo <span className="text-text-muted">(opcional)</span></span><input value={form.trainingType} onChange={(event) => setForm({ ...form, trainingType: event.target.value })} placeholder="INICIAL, PERIÓDICO..." className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Carga horária <span className="text-text-muted">(opcional)</span></span><input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} placeholder="02 HORAS, 01:30..." className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Modalidade</span><input required value={form.modality} onChange={(event) => setForm({ ...form, modality: event.target.value })} className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Forma de atendimento</span><input required value={form.attendanceType} onChange={(event) => setForm({ ...form, attendanceType: event.target.value })} className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Quantidade base</span><input required type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Valor adicional/aluno</span><input required value={form.additionalStudentPrice} onChange={(event) => setForm({ ...form, additionalStudentPrice: event.target.value })} placeholder="0,00" className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Valor unitário</span><input required value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} placeholder="0,00" className="input input-bordered w-full" /></label>
          <label className="form-control"><span className="label-text mb-1">Valor total</span><input required value={form.totalPrice} onChange={(event) => setForm({ ...form, totalPrice: event.target.value })} placeholder="0,00" className="input input-bordered w-full" /></label>
        </div>
        <div className="modal-action">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving} disabled={saving}>Criar treinamento</Button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar modal" onClick={onClose}>Fechar</button></form>
    </dialog>
  );
}

export default function TrainingsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Training[]>([]);
  const [facets, setFacets] = useState<{ modalities: string[]; attendanceTypes: string[] }>({ modalities: [], attendanceTypes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [selected, setSelected] = useState<Training | null>(null);
  const [showNewTraining, setShowNewTraining] = useState(false);

  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [modality, setModality] = useState("PRESENCIAL");
  const [attendanceType, setAttendanceType] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("true");

  const canManage = permissions.includes("training.manage");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/trainings");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar os treinamentos.");
      setItems(body.items ?? []);
      setFacets(body.filters ?? { modalities: [], attendanceTypes: [] });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os treinamentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, []);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((me) => { setCurrentUserEmail(me.email ?? null); setPermissions(me.permissions ?? []); })
      .catch(() => undefined);
  }, []);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.supplier.id, item.supplier.tradeName);
    return [...map.entries()];
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.description.toLowerCase().includes(q)) return false;
      if (supplierId && item.supplier.id !== supplierId) return false;
      if (modality && item.modality !== modality) return false;
      if (attendanceType && item.attendanceType !== attendanceType) return false;
      if (activeFilter === "true" && !item.active) return false;
      if (activeFilter === "false" && item.active) return false;
      return true;
    });
  }, [items, query, supplierId, modality, attendanceType, activeFilter]);

  const summary = useMemo(() => {
    const uniqueSuppliers = [...new Set(items.map((item) => item.supplier.tradeName))];
    const uniqueProposals = [...new Set(items.map((item) => item.proposal?.proposalNumber).filter((value): value is string => Boolean(value)))];
    const dominantModality = mostFrequent(items.map((item) => item.modality));
    return {
      total: items.length,
      supplierLabel: uniqueSuppliers.length === 1 ? uniqueSuppliers[0] : uniqueSuppliers.length === 0 ? "—" : `${uniqueSuppliers.length} fornecedores`,
      proposalLabel: uniqueProposals.length === 1 ? `Nº ${uniqueProposals[0]}` : uniqueProposals.length === 0 ? "—" : `${uniqueProposals.length} propostas`,
      dominantModality: dominantModality ?? "—",
    };
  }, [items]);

  const toggleActive = async (item: Training) => {
    try {
      const response = await fetch(`/api/trainings/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao alterar a situação.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao alterar a situação.");
    }
  };

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };

  return (
    <div className="flex flex-1 flex-col">
      <CorporateHeader currentUserEmail={currentUserEmail} onLogout={logout} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader
          eyebrow="Cadastros"
          title="Treinamentos"
          description="Catálogo de treinamentos tabelados por fornecedor, a partir das propostas comerciais recebidas."
          actions={canManage && <Button aura onClick={() => setShowNewTraining(true)}>+ Novo treinamento</Button>}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Treinamentos cadastrados" value={String(summary.total)} />
          <MetricCard label="Fornecedor" value={summary.supplierLabel} />
          <MetricCard label="Proposta" value={summary.proposalLabel} />
          <MetricCard label="Modalidade predominante" value={summary.dominantModality} />
        </div>

        {error && <p className="rounded-md border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</p>}

        <FilterBar>
          <input aria-label="Buscar por treinamento" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por treinamento" className="input input-bordered w-full sm:col-span-2" />
          <select aria-label="Filtrar fornecedor" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="select select-bordered w-full">
            <option value="">Todos os fornecedores</option>
            {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Filtrar modalidade" value={modality} onChange={(event) => setModality(event.target.value)} className="select select-bordered w-full">
            <option value="">Todas as modalidades</option>
            {facets.modalities.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filtrar forma de atendimento" value={attendanceType} onChange={(event) => setAttendanceType(event.target.value)} className="select select-bordered w-full">
            <option value="">Todas as formas de atendimento</option>
            {facets.attendanceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filtrar situação" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as "" | "true" | "false")} className="select select-bordered w-full">
            <option value="">Situação: todas</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </FilterBar>

        {!loading && visible.length === 0 ? (
          <div className="card"><EmptyState title="Nenhum treinamento encontrado" description="Ajuste os filtros ou importe uma nova proposta comercial." /></div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-border bg-base-200">
                  <th className="p-3 text-left">Treinamento</th>
                  <th className="p-3 text-left">Modalidade</th>
                  <th className="p-3 text-left">Forma de atendimento</th>
                  <th className="p-3 text-right">Valor adicional/aluno</th>
                  <th className="p-3 text-right">Quantidade</th>
                  <th className="p-3 text-right">Valor unitário</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-left">Fornecedor</th>
                  <th className="p-3 text-center">Situação</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="p-3 font-medium">{item.description}</td>
                    <td className="p-3">{item.modality}</td>
                    <td className="p-3">{item.attendanceType}</td>
                    <td className="whitespace-nowrap p-3 text-right">{money(item.additionalStudentPrice)}</td>
                    <td className="p-3 text-right">{item.quantity}</td>
                    <td className="whitespace-nowrap p-3 text-right">{money(item.unitPrice)}</td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold">{money(item.totalPrice)}</td>
                    <td className="p-3">{item.supplier.tradeName}</td>
                    <td className="p-3 text-center"><Badge tone={item.active ? "success" : "neutral"}>{item.active ? "Ativo" : "Inativo"}</Badge></td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(item)}>Visualizar</Button>
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(item)}>{item.active ? "Inativar" : "Ativar"}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <TrainingModal item={selected} canManage={canManage} onClose={() => setSelected(null)} onSaved={load} />
      <NewTrainingModal open={showNewTraining} onClose={() => setShowNewTraining(false)} onCreated={load} />
    </div>
  );
}
