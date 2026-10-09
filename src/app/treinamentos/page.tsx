"use client";

// Cadastros → Treinamentos (catálogo por fornecedor/proposta). Fase 7J: apresentação no Design System (PageHeader,
// FilterBar/SearchInput, DataTable, Dialog com Field/CurrencyInput). Filtros, payloads (valores como texto decimal com
// ponto), permissão training.manage e ativar/inativar continuam AQUI, sem mudança de regra; o servidor valida.
import { useEffect, useMemo, useState } from "react";
import { PencilLine, Plus } from "lucide-react";
import { Button, Dialog, FeedbackAlert, Field, FilterBar, PageHeader, SearchInput, StatusBadge, TextInput, textInputClassName } from "@/components/ui";
import { dateBr, money } from "@/modules/trainings/ui/format";
import { TrainingFormFields } from "@/modules/trainings/ui/TrainingFormFields";
import { TrainingTable } from "@/modules/trainings/ui/TrainingTable";
import type { NewTrainingForm, Proposal, Supplier, Training, TrainingForm } from "@/modules/trainings/ui/types";

function mostFrequent(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function toEditForm(item: Training): TrainingForm {
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

function TrainingDialog({ item, canManage, onClose, onSaved }: { item: Training | null; canManage: boolean; onClose: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TrainingForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setEditing(false); setError(null); setForm(item ? toEditForm(item) : null); }, 0);
    return () => window.clearTimeout(timeout);
  }, [item]);

  const save = async () => {
    if (!form || !item) return;
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

  const footer = item && <>
    {canManage && !editing && <Button variant="secondary" onClick={() => setEditing(true)}><PencilLine size={14} aria-hidden="true" />Editar</Button>}
    {editing && <Button variant="secondary" onClick={() => { setEditing(false); setForm(toEditForm(item)); setError(null); }} disabled={saving}>Cancelar edição</Button>}
    {editing && <Button aura onClick={save} loading={saving} disabled={saving}>Salvar</Button>}
    {!editing && <Button variant="secondary" onClick={onClose}>Fechar</Button>}
  </>;

  return (
    <Dialog open={Boolean(item)} onClose={() => { if (!saving) onClose(); }} dismissible={!saving} size="lg" title={editing ? "Editar treinamento" : "Detalhe do treinamento"} description={item?.supplier.tradeName} footer={footer}>
      {item && <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={item.origin === "IMPORTED" ? "info" : "neutral"}>{item.origin === "IMPORTED" ? "Importado" : "Manual"}</StatusBadge>
          <StatusBadge tone={item.active ? "success" : "neutral"}>{item.active ? "Ativo" : "Inativo"}</StatusBadge>
        </div>
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        {editing && form ? (
          <TrainingFormFields form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        ) : (
          <dl className="grid grid-cols-1 gap-3 text-body sm:grid-cols-2">
            {[
              ["Descrição", item.description, true],
              ["Fornecedor", item.supplier.tradeName],
              ["Proposta", item.proposal ? `Nº ${item.proposal.proposalNumber}` : "Sem proposta (cadastro manual)"],
              ["Data da proposta", item.proposal ? dateBr(item.proposal.proposalDate) : "—"],
              ["Modalidade", item.modality],
              ["Forma de atendimento", item.attendanceType],
              ["Quantidade base", String(item.quantity)],
              ["Valor unitário", money(item.unitPrice)],
              ["Valor adicional por aluno", money(item.additionalStudentPrice)],
              ["Total original", money(item.totalPrice)],
            ].map(([label, value, wide]) => (
              <div key={String(label)} className={wide ? "sm:col-span-2" : undefined}><dt className="text-caption text-foreground-muted">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>
            ))}
          </dl>
        )}
      </div>}
    </Dialog>
  );
}

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

function NewTrainingDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [form, setForm] = useState<NewTrainingForm>(EMPTY_NEW_TRAINING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      dismissible={!saving}
      size="lg"
      title="Novo treinamento"
      description="Cadastro manual de um treinamento tabelado; o servidor valida fornecedor, proposta e valores."
      footer={<><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="submit" form="new-training-form" aura loading={saving} disabled={saving}>Criar treinamento</Button></>}
    >
      <form id="new-training-form" onSubmit={submit} className="grid gap-4">
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        <TrainingFormFields
          form={form}
          required
          onChange={(patch) => setForm({ ...form, ...patch })}
          before={<>
            <Field label="Fornecedor" required className="sm:col-span-2">{(control) => (
              <select {...control} required value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value, proposalId: "" })} className={textInputClassName}>
                <option value="">Selecione um fornecedor cadastrado</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName}</option>)}
              </select>
            )}</Field>
            <Field label="Proposta" helper="Opcional." className="sm:col-span-2">{(control) => (
              <select {...control} value={form.proposalId} onChange={(event) => setForm({ ...form, proposalId: event.target.value })} className={textInputClassName} disabled={!form.supplierId}>
                <option value="">Sem proposta comercial formal</option>
                {proposals.map((proposal) => <option key={proposal.id} value={proposal.id}>Nº {proposal.proposalNumber}</option>)}
              </select>
            )}</Field>
            <Field label="Tipo" helper="Opcional. Ex.: INICIAL, PERIÓDICO.">{(control) => <TextInput {...control} value={form.trainingType} onChange={(event) => setForm({ ...form, trainingType: event.target.value })} />}</Field>
            <Field label="Carga horária" helper="Opcional. Ex.: 02 HORAS, 01:30.">{(control) => <TextInput {...control} value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} />}</Field>
          </>}
        />
      </form>
    </Dialog>
  );
}

export default function TrainingsPage() {
  const [items, setItems] = useState<Training[]>([]);
  const [facets, setFacets] = useState<{ modalities: string[]; attendanceTypes: string[] }>({ modalities: [], attendanceTypes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
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
      .then((me) => { setPermissions(me.permissions ?? []); })
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

  // Padrões da tela (modalidade PRESENCIAL, situação Ativos) não contam como filtro ativo; "Limpar" volta a eles.
  const activeFilters = [query.trim(), supplierId, modality !== "PRESENCIAL" ? modality || "todas" : "", attendanceType, activeFilter !== "true" ? activeFilter || "todas" : ""].filter(Boolean).length;
  const indicators: [string, string][] = [["Treinamentos cadastrados", String(summary.total)], ["Fornecedor", summary.supplierLabel], ["Proposta", summary.proposalLabel], ["Modalidade predominante", summary.dominantModality]];

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
        <PageHeader
          eyebrow="Cadastros"
          title="Treinamentos"
          description="Catálogo de treinamentos tabelados por fornecedor, a partir das propostas comerciais recebidas."
          actions={canManage && <Button aura onClick={() => setShowNewTraining(true)}><Plus size={16} aria-hidden="true" />Novo treinamento</Button>}
        />

        <dl aria-label="Indicadores do catálogo" className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4">
          {indicators.map(([label, value]) => <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5 bg-surface px-4 py-3"><dt className="text-caption text-foreground-muted">{label}</dt><dd className="truncate text-card-title tabular-nums">{value}</dd></div>)}
        </dl>

        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}

        <FilterBar
          label="Filtros de treinamentos"
          search={<SearchInput label="Buscar por treinamento" placeholder="Buscar por treinamento" value={query} onValueChange={setQuery} />}
          activeCount={activeFilters}
          onClear={() => { setQuery(""); setSupplierId(""); setModality("PRESENCIAL"); setAttendanceType(""); setActiveFilter("true"); }}
        >
          <select aria-label="Filtrar fornecedor" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={textInputClassName}>
            <option value="">Todos os fornecedores</option>
            {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Filtrar modalidade" value={modality} onChange={(event) => setModality(event.target.value)} className={textInputClassName}>
            <option value="">Todas as modalidades</option>
            {facets.modalities.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filtrar forma de atendimento" value={attendanceType} onChange={(event) => setAttendanceType(event.target.value)} className={textInputClassName}>
            <option value="">Todas as formas de atendimento</option>
            {facets.attendanceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filtrar situação" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as "" | "true" | "false")} className={textInputClassName}>
            <option value="">Situação: todas</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </FilterBar>

        <p className="text-body text-foreground-muted tabular-nums" role="status">{loading ? "Carregando treinamentos..." : `${visible.length} de ${items.length} treinamento(s)`}</p>
        <TrainingTable rows={visible} loading={loading} canManage={canManage} onView={setSelected} onToggleActive={(item) => void toggleActive(item)} />
      </main>

      <TrainingDialog item={selected} canManage={canManage} onClose={() => setSelected(null)} onSaved={load} />
      <NewTrainingDialog open={showNewTraining} onClose={() => setShowNewTraining(false)} onCreated={load} />
    </div>
  );
}
