"use client";

// Despesas → Treinamentos (lançamentos realizados, rateio por setor e resumo da competência). Fase 7J: apresentação no
// Design System (PageHeader, Tabs, FilterBar/SearchInput, DataTable, Dialog com Field/CurrencyInput, CalculatedValue).
// Regras inalteradas e AQUI: prévia do valor (base + adicionais), justificativa obrigatória quando o valor final diverge,
// POST + PATCH de ajuste, concluir/cancelar com motivo, redistribuição do rateio com o mesmo total por lançamento e os
// mesmos payloads (valores como texto decimal com ponto). O servidor recalcula e valida tudo.
// O rateio de treinamento é um sistema próprio (Fornecedor → Departamento), sem Empresa/4 perspectivas; o XLSX dele
// continua o mesmo (rota rateio/download).
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, PencilLine, Plus } from "lucide-react";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { Button, buttonClassName, CalculatedValue, CurrencyInput, DataTable, Dialog, FeedbackAlert, Field, FilterBar, PageHeader, SearchInput, SkeletonCard, SkeletonGroup, StatusBadge, TabPanel, Tabs, TextInput, textInputClassName, EmptyState } from "@/components/ui";
import { currencyText, currencyValue, dateBr, money } from "@/modules/trainings/ui/format";
import { ExpenseTable } from "@/modules/accounts-payable/training-expense/ui/ExpenseTable";
import { RateioTotals, TrainingRateioPanel } from "@/modules/accounts-payable/training-expense/ui/TrainingRateioPanel";
import { TrainingSummaryPanel } from "@/modules/accounts-payable/training-expense/ui/TrainingSummaryPanel";
import { EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, type ExpenseDetail, type ExpenseListItem, type Participant, type RateioCardData, type RateioData, type RateioRowData, type SummaryData, type Supplier, type TrainingOption } from "@/modules/accounts-payable/training-expense/ui/types";

function calculatePreview(training: TrainingOption | null, participantCount: number) {
  if (!training || participantCount < 1) return null;
  const unit = Number(training.unitPrice);
  const additional = Number(training.additionalStudentPrice);
  const extra = Math.max(0, participantCount - training.quantity);
  const total = unit + extra * additional;
  return { unit, additional, extra, total };
}

function NewExpenseDialog({ open, year, month, onClose, onCreated }: { open: boolean; year: number; month: number; onClose: () => void; onCreated: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [trainings, setTrainings] = useState<TrainingOption[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [trainingId, setTrainingId] = useState("");
  const [trainingDate, setTrainingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [finalAmountOverride, setFinalAmountOverride] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      setSupplierId(""); setTrainingId(""); setEmployeeIds([]); setFinalAmountOverride(""); setAdjustmentReason(""); setError(null); setReasonError(undefined);
      fetch("/api/administrative-entities").then((r) => r.json()).then((b) => setSuppliers(b.items ?? [])).catch(() => undefined);
      fetch("/api/collaborators?limit=1000").then((r) => r.json()).then((b) => setCollaborators(b.items ?? [])).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!supplierId) { setTrainings([]); return; }
      fetch(`/api/trainings?supplierId=${supplierId}&active=true`).then((r) => r.json()).then((b) => setTrainings(b.items ?? [])).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [supplierId]);

  const selectedTraining = trainings.find((t) => t.id === trainingId) ?? null;
  const preview = calculatePreview(selectedTraining, employeeIds.length);
  const calculatedAmount = preview?.total ?? 0;
  const finalAmount = finalAmountOverride ? Number(finalAmountOverride.replace(",", ".")) : calculatedAmount;
  const diverges = Boolean(finalAmountOverride) && Math.abs(finalAmount - calculatedAmount) > 0.001;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (diverges && !adjustmentReason.trim()) { setReasonError("Informe a justificativa do ajuste quando o valor final divergir do valor calculado."); return; }
    setSaving(true); setError(null); setReasonError(undefined);
    try {
      const response = await fetch("/api/accounts-payable/training-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, trainingId, trainingDate, employeeIds }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao registrar o treinamento.");
      if (diverges) {
        const patch = await fetch(`/api/accounts-payable/training-expense/${body.item.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finalAmount: String(finalAmount), adjustmentReason: adjustmentReason.trim() }),
        });
        const patchBody = await patch.json();
        if (!patch.ok) throw new Error(patchBody.error ?? "Falha ao ajustar o valor final.");
      }
      onCreated(); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao registrar o treinamento.");
    } finally { setSaving(false); }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      dismissible={!saving}
      size="lg"
      title="Registrar treinamento"
      description={`Competência ${String(month).padStart(2, "0")}/${year}. O servidor recalcula o valor e o rateio ao salvar.`}
      footer={<><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="submit" form="new-training-expense-form" aura loading={saving} disabled={saving || !employeeIds.length}>Salvar rascunho</Button></>}
    >
      <form id="new-training-expense-form" onSubmit={submit} className="grid gap-5">
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-label text-foreground-muted">Treinamento</legend>
          <Field label="Fornecedor" required>{(control) => (
            <select {...control} required value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setTrainingId(""); }} className={textInputClassName}>
              <option value="">Selecione o fornecedor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
            </select>
          )}</Field>
          <Field label="Data do treinamento" required>{(control) => <input {...control} required type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} className={textInputClassName} />}</Field>
          <Field label="Treinamento" required className="sm:col-span-2" helper={supplierId ? `${trainings.length} treinamento(s) ativo(s) deste fornecedor.` : undefined}>{(control) => (
            <select {...control} required value={trainingId} onChange={(e) => setTrainingId(e.target.value)} className={textInputClassName} disabled={!supplierId}>
              <option value="">{supplierId ? "Selecione o treinamento" : "Selecione um fornecedor primeiro"}</option>
              {trainings.map((t) => <option key={t.id} value={t.id}>{t.description} · {t.duration ?? t.modality} · {t.attendanceType}</option>)}
            </select>
          )}</Field>
        </fieldset>

        {selectedTraining && (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-label text-foreground-muted">Participantes</legend>
            <CollaboratorMultiCombobox value={employeeIds} onChange={setEmployeeIds} options={collaborators} />
          </fieldset>
        )}

        {preview && selectedTraining && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Prévia do valor">
            <CalculatedValue label={`Base (${selectedTraining.quantity})`} value={money(preview.unit)} />
            <CalculatedValue label={`Adicionais (${preview.extra})`} value={money(preview.extra * preview.additional)} />
            <CalculatedValue label="Valor calculado" value={money(preview.total)} helper="Prévia; o servidor recalcula ao salvar." live />
            <CalculatedValue label="Participantes" value={employeeIds.length} />
          </div>
        )}

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-label text-foreground-muted">Valor final</legend>
          <Field label="Valor final (R$)" helper="Em branco = valor calculado.">{(control) => <CurrencyInput {...control} value={currencyValue(finalAmountOverride)} onValueChange={(value) => setFinalAmountOverride(currencyText(value))} placeholder={preview ? preview.total.toFixed(2).replace(".", ",") : "0,00"} />}</Field>
          {diverges && (
            <Field label="Justificativa do ajuste" required error={reasonError}>{(control) => <TextInput {...control} required value={adjustmentReason} onChange={(e) => { setAdjustmentReason(e.target.value); setReasonError(undefined); }} />}</Field>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}

const participantColumns = [
  { id: "employee", header: "Colaborador", rowHeader: true, wrap: true, cell: (p: Participant) => p.employee.officialName },
  { id: "department", header: "Setor", wrap: true, cell: (p: Participant) => p.department },
  { id: "amount", header: "Valor", numeric: true, cell: (p: Participant) => money(p.allocatedAmount) },
];

function ExpenseDetailDialog({ id, canManage, onClose, onChanged }: { id: string | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | undefined>(undefined);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setError(null); setShowCancel(false); setCancelReason(""); setCancelError(undefined); setDetail(null);
      if (id) fetch(`/api/accounts-payable/training-expense/${id}`).then((r) => r.json()).then((b) => setDetail(b.item ?? null)).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [id]);

  const complete = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/accounts-payable/training-expense/${id}/complete`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao concluir o lançamento.");
      setDetail(body.item); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao concluir o lançamento."); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!cancelReason.trim()) { setCancelError("Informe o motivo do cancelamento."); return; }
    setBusy(true); setError(null); setCancelError(undefined);
    try {
      const response = await fetch(`/api/accounts-payable/training-expense/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: cancelReason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao cancelar o lançamento.");
      setDetail(body.item); onChanged(); setShowCancel(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cancelar o lançamento."); }
    finally { setBusy(false); }
  };

  const footer = detail && <>
    {canManage && detail.status === "DRAFT" && <Button aura onClick={complete} loading={busy} disabled={busy}>Concluir lançamento</Button>}
    {canManage && detail.status !== "CANCELLED" && !showCancel && <Button variant="error" onClick={() => setShowCancel(true)} disabled={busy}>Cancelar lançamento</Button>}
    {canManage && showCancel && <Button variant="error" onClick={cancel} loading={busy} disabled={busy}>Confirmar cancelamento</Button>}
    <Button variant="secondary" onClick={onClose} disabled={busy}>Fechar</Button>
  </>;

  const facts: [string, string, boolean?][] = detail ? [
    ["Fornecedor", detail.supplier.tradeName],
    ["Data", dateBr(detail.trainingDate)],
    ["Quantidade base / adicional (snapshot)", `${detail.baseQuantitySnapshot} · ${money(detail.unitPriceSnapshot)} + ${money(detail.additionalStudentPriceSnapshot)}/aluno`],
    ["Participantes", String(detail.participantCount)],
    ["Valor calculado", money(detail.calculatedAmount)],
    ["Valor final", money(detail.finalAmount)],
    ...(detail.adjustmentReason ? [["Justificativa do ajuste", detail.adjustmentReason, true] as [string, string, boolean]] : []),
    ...(detail.financialRecord ? [["Registro financeiro", `${detail.financialRecord.identifier} · ${money(detail.financialRecord.grossAmount)}`, true] as [string, string, boolean]] : []),
    ...(detail.cancellationReason ? [["Motivo do cancelamento", detail.cancellationReason, true] as [string, string, boolean]] : []),
  ] : [];

  return (
    <Dialog open={Boolean(id)} onClose={() => { if (!busy) onClose(); }} dismissible={!busy} size="lg" title={detail?.training.description ?? "Lançamento de treinamento"} description={detail ? `Competência ${String(detail.competence.month).padStart(2, "0")}/${detail.competence.year}` : undefined} footer={footer}>
      {!detail ? <SkeletonGroup label="Carregando lançamento"><SkeletonCard lines={3} /></SkeletonGroup> : (
        <div className="grid gap-4">
          <StatusBadge tone={EXPENSE_STATUS_TONE[detail.status]} className="w-fit">{EXPENSE_STATUS_LABEL[detail.status]}</StatusBadge>
          {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
          <dl className="grid grid-cols-1 gap-3 text-body sm:grid-cols-2">
            {facts.map(([label, value, wide]) => <div key={label} className={wide ? "sm:col-span-2" : undefined}><dt className="text-caption text-foreground-muted">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}
          </dl>
          <DataTable caption={`Participantes (${detail.participants.length})`} captionVisible columns={participantColumns} rows={detail.participants} getRowId={(p) => p.id} density="dense" maxHeight="14rem" />
          {detail.revisions.length > 0 && (
            <section aria-labelledby="training-expense-revisions" className="grid gap-1">
              <h3 id="training-expense-revisions" className="text-label">Histórico de revisões</h3>
              <ul className="grid gap-1 text-caption text-foreground-muted">
                {detail.revisions.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-1 tabular-nums">Rev. {r.revision}: {money(r.previousTotal)}<ArrowRight size={12} aria-label="para" />{money(r.newTotal)} em {new Date(r.createdAt).toLocaleString("pt-BR")}</li>)}
              </ul>
            </section>
          )}
          {showCancel && <Field label="Motivo do cancelamento" required error={cancelError}>{(control) => <TextInput {...control} value={cancelReason} onChange={(e) => { setCancelReason(e.target.value); setCancelError(undefined); }} />}</Field>}
        </div>
      )}
    </Dialog>
  );
}

const toCents = (value: string) => Math.round(Number(String(value).replace(",", ".")) * 100);
const fromCents = (value: number) => money(value / 100);

function AllocationEditorDialog({ card, onClose, onSaved }: { card: RateioCardData; onClose: () => void; onSaved: () => void }) {
  const initial = useMemo(() => {
    const values: Record<string, string> = {};
    for (const department of card.departments) for (const row of department.rows) values[row.participantId] = Number(row.amount).toFixed(2);
    return values;
  }, [card]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participantsByExpense = useMemo(() => {
    const map = new Map<string, (RateioRowData & { department: string })[]>();
    for (const department of card.departments) for (const row of department.rows) map.set(row.expenseId, [...(map.get(row.expenseId) ?? []), { ...row, department: department.department }]);
    return map;
  }, [card]);

  const sums = card.expenses.map((expense) => {
    const informed = (participantsByExpense.get(expense.id) ?? []).reduce((sum, row) => sum + toCents(values[row.participantId] ?? "0"), 0);
    return { expense, informed, expected: toCents(expense.finalAmount), valid: informed === toCents(expense.finalAmount) };
  });
  const allValid = sums.every((entry) => entry.valid);
  const changed = card.expenses.filter((expense) => (participantsByExpense.get(expense.id) ?? []).some((row) => toCents(values[row.participantId] ?? "0") !== toCents(initial[row.participantId])));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      for (const expense of changed) {
        const rows = (participantsByExpense.get(expense.id) ?? []).map((row) => ({ participantId: row.participantId, allocatedAmount: values[row.participantId] }));
        const response = await fetch(`/api/accounts-payable/training-expense/${expense.id}/allocation`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao salvar o rateio.");
      }
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar o rateio."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog
      open
      onClose={() => { if (!saving) onClose(); }}
      dismissible={!saving}
      size="lg"
      title={`Editar rateio · ${card.supplierName}`}
      description="Redistribui o mesmo valor final de cada lançamento entre os participantes. O total não pode ser alterado por aqui."
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button><Button aura onClick={save} loading={saving} disabled={saving || !allValid || !changed.length}>Salvar rateio</Button></>}
    >
      <div className="grid gap-4">
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        {sums.map(({ expense, informed, expected, valid }) => (
          <section key={expense.id} aria-label={`${expense.trainingDescription} de ${dateBr(expense.trainingDate)}`} className="grid gap-2 rounded-control border border-border p-3">
            <h3 className="text-body font-semibold">{expense.trainingDescription} · {dateBr(expense.trainingDate)}{expense.financialIdentifier ? ` · ${expense.financialIdentifier}` : ""}</h3>
            <DataTable
              caption={`Valores por participante de ${expense.trainingDescription}`}
              columns={[
                { id: "employee", header: "Colaborador", rowHeader: true, wrap: true, cell: (row: RateioRowData & { department: string }) => row.employeeName },
                { id: "department", header: "Setor", wrap: true, cell: (row: RateioRowData & { department: string }) => row.department },
                { id: "value", header: "Valor (R$)", align: "right", className: "w-40", cell: (row: RateioRowData & { department: string }) => <CurrencyInput aria-label={`Valor de ${row.employeeName}`} value={currencyValue(values[row.participantId] ?? "")} onValueChange={(value) => setValues({ ...values, [row.participantId]: currencyText(value) })} /> },
              ]}
              rows={participantsByExpense.get(expense.id) ?? []}
              getRowId={(row) => row.participantId}
              density="dense"
            />
            <p className={valid ? "text-caption text-foreground-muted tabular-nums" : "text-caption text-danger-text tabular-nums"} role={valid ? undefined : "alert"}>Total esperado {fromCents(expected)} · informado {fromCents(informed)} · diferença {fromCents(expected - informed)}</p>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function RateioTab({ year, month, canManage }: { year: number; month: number; canManage: boolean }) {
  const [data, setData] = useState<RateioData | null>(null);
  const [editing, setEditing] = useState<RateioCardData | null>(null);

  const load = () => fetch(`/api/accounts-payable/training-expense/rateio?year=${year}&month=${month}`).then((r) => r.json()).then(setData).catch(() => undefined);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [year, month]);

  if (!data) return <SkeletonGroup label="Carregando rateio"><SkeletonCard lines={3} /></SkeletonGroup>;
  if (!data.cards.length) return <EmptyState title="Nenhum rateio nesta competência" description="Conclua ao menos um lançamento de treinamento para ver o rateio por setor." />;

  return (
    <div className="grid gap-4">
      {data.cards.map((card) => (
        <TrainingRateioPanel
          key={`${card.supplierId}-${card.competence.year}-${card.competence.month}`}
          card={card}
          actions={<>
            {canManage && <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(card)}><PencilLine size={14} aria-hidden="true" />Editar rateio</Button>}
            <a href={`/api/accounts-payable/training-expense/rateio/download?year=${year}&month=${month}&supplierId=${card.supplierId}`} className={buttonClassName({ variant: "secondary", size: "sm" })}><Download size={14} aria-hidden="true" />Download do rateio XLSX</a>
          </>}
        />
      ))}
      {data.cards.length > 1 && <RateioTotals total={data.totalAmount} allocated={data.totalAllocated} difference={data.difference} label="Totais da competência" />}
      {editing && <AllocationEditorDialog key={editing.supplierId} card={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}

function ResumoTab({ year, month }: { year: number; month: number }) {
  const [data, setData] = useState<SummaryData | null>(null);
  useEffect(() => { fetch(`/api/accounts-payable/training-expense/summary?year=${year}&month=${month}`).then((r) => r.json()).then(setData).catch(() => undefined); }, [year, month]);
  if (!data) return <SkeletonGroup label="Carregando resumo"><SkeletonCard lines={3} /></SkeletonGroup>;
  return <TrainingSummaryPanel data={data} />;
}

const TABS = [{ value: "lancamentos", label: "Lançamentos" }, { value: "rateio", label: "Rateio" }, { value: "resumo", label: "Resumo" }];

export default function TrainingExpensePage() {
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = competence.split("-").map(Number);
  const [tab, setTab] = useState<"lancamentos" | "rateio" | "resumo">("lancamentos");
  const [items, setItems] = useState<ExpenseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canManage = permissions.includes("financial-records.create") || permissions.includes("financial-records.update");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (supplierFilter) params.set("supplierId", supplierFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/accounts-payable/training-expense?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar os lançamentos.");
      setItems(body.items ?? []);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar os lançamentos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [year, month, supplierFilter, statusFilter, query]);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((me) => { setPermissions(me.permissions ?? []); }).catch(() => undefined);
    fetch("/api/administrative-entities").then((r) => r.json()).then((b) => setSuppliers(b.items ?? [])).catch(() => undefined);
  }, []);

  const activeFilters = [query.trim(), supplierFilter, statusFilter].filter(Boolean).length;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
        <PageHeader
          backHref="/pagamentos"
          backLabel="Despesas"
          eyebrow="Despesas"
          title="Treinamentos"
          description="Treinamentos realizados, participantes, custo e rateio por setor nesta competência."
          actions={canManage && <Button aura onClick={() => setShowNew(true)}><Plus size={16} aria-hidden="true" />Registrar treinamento</Button>}
        />

        <Field label="Competência" required className="w-full sm:w-56">{(control) => <input {...control} type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className={textInputClassName} />}</Field>

        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}

        <Tabs label="Visões de treinamentos" items={TABS} value={tab} onValueChange={(value) => setTab(value as typeof tab)} variant="segmented">
          <TabPanel value="lancamentos" className="mt-4 grid gap-4">
            <FilterBar
              label="Filtros de lançamentos"
              search={<SearchInput label="Buscar por treinamento" placeholder="Buscar por treinamento" value={query} onValueChange={setQuery} />}
              activeCount={activeFilters}
              onClear={() => { setQuery(""); setSupplierFilter(""); setStatusFilter(""); }}
            >
              <select aria-label="Filtrar fornecedor" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={textInputClassName}>
                <option value="">Todos os fornecedores</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
              </select>
              <select aria-label="Filtrar situação" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={textInputClassName}>
                <option value="">Todas as situações</option>
                <option value="DRAFT">Rascunho</option>
                <option value="COMPLETED">Concluído</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </FilterBar>
            <ExpenseTable rows={items} loading={loading} onView={setSelectedId} />
          </TabPanel>
          <TabPanel value="rateio" className="mt-4"><RateioTab year={year} month={month} canManage={canManage} /></TabPanel>
          <TabPanel value="resumo" className="mt-4"><ResumoTab year={year} month={month} /></TabPanel>
        </Tabs>
      </main>

      <NewExpenseDialog open={showNew} year={year} month={month} onClose={() => setShowNew(false)} onCreated={load} />
      <ExpenseDetailDialog id={selectedId} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={load} />
    </div>
  );
}
