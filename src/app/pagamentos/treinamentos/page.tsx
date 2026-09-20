"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CorporateHeader } from "@/components/CorporateHeader";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { AllocationCard, AllocationDepartmentAccordion, AllocationDepartmentList } from "@/components/allocation/AllocationCard";
import { Badge, Button, buttonClassName, EmptyState, FilterBar, MetricCard, PageHeader } from "@/components/ui";

const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const dateBr = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });

type Supplier = { id: string; tradeName: string };
type TrainingOption = { id: string; description: string; modality: string; attendanceType: string; duration: string | null; quantity: number; unitPrice: string; additionalStudentPrice: string };

type ExpenseListItem = {
  id: string;
  trainingDate: string;
  participantCount: number;
  finalAmount: string;
  status: "DRAFT" | "COMPLETED" | "CANCELLED";
  training: { id: string; description: string; modality: string; attendanceType: string };
  supplier: { id: string; tradeName: string };
  competence: { year: number; month: number };
};

type Participant = { id: string; employeeId: string; department: string; costCenter: string; allocatedAmount: string; employee: { officialName: string } };
type Revision = { id: string; revision: number; previousTotal: string; newTotal: string; createdAt: string };
type ExpenseDetail = ExpenseListItem & {
  baseQuantitySnapshot: number;
  unitPriceSnapshot: string;
  additionalStudentPriceSnapshot: string;
  calculatedAmount: string;
  adjustmentReason: string | null;
  cancellationReason: string | null;
  financialRecord: { id: string; identifier: string; grossAmount: string } | null;
  participants: Participant[];
  revisions: Revision[];
};

const STATUS_TONE: Record<ExpenseListItem["status"], "neutral" | "success" | "warning" | "error"> = { DRAFT: "warning", COMPLETED: "success", CANCELLED: "neutral" };
const STATUS_LABEL: Record<ExpenseListItem["status"], string> = { DRAFT: "Rascunho", COMPLETED: "Concluído", CANCELLED: "Cancelado" };

function calculatePreview(training: TrainingOption | null, participantCount: number) {
  if (!training || participantCount < 1) return null;
  const unit = Number(training.unitPrice);
  const additional = Number(training.additionalStudentPrice);
  const extra = Math.max(0, participantCount - training.quantity);
  const total = unit + extra * additional;
  return { unit, additional, extra, total };
}

function NewExpenseModal({ open, year, month, onClose, onCreated }: { open: boolean; year: number; month: number; onClose: () => void; onCreated: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      setSupplierId(""); setTrainingId(""); setEmployeeIds([]); setFinalAmountOverride(""); setAdjustmentReason(""); setError(null);
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

  if (!open) return <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose} />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (diverges && !adjustmentReason.trim()) { setError("Informe a justificativa do ajuste quando o valor final divergir do valor calculado."); return; }
    setSaving(true); setError(null);
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
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <form onSubmit={submit} className="modal-box max-w-3xl border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">Registrar treinamento</h2>
        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="form-control"><span className="label-text mb-1">Fornecedor</span>
            <select required value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setTrainingId(""); }} className="select select-bordered w-full">
              <option value="">Selecione o fornecedor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
            </select>
          </label>
          <label className="form-control"><span className="label-text mb-1">Data do treinamento</span>
            <input required type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} className="input input-bordered w-full" />
          </label>
          <label className="form-control sm:col-span-2"><span className="label-text mb-1">Treinamento</span>
            <select required value={trainingId} onChange={(e) => setTrainingId(e.target.value)} className="select select-bordered w-full" disabled={!supplierId}>
              <option value="">{supplierId ? `${trainings.length} treinamento(s) disponível(is)` : "Selecione um fornecedor primeiro"}</option>
              {trainings.map((t) => <option key={t.id} value={t.id}>{t.description} — {t.duration ?? t.modality} — {t.attendanceType}</option>)}
            </select>
          </label>
        </div>

        {selectedTraining && (
          <div className="mt-4">
            <CollaboratorMultiCombobox value={employeeIds} onChange={setEmployeeIds} options={collaborators} />
          </div>
        )}

        {preview && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-base-300 bg-base-200 p-4 text-sm sm:grid-cols-4">
            <div><span className="block text-text-muted">Base ({selectedTraining!.quantity})</span><strong>{money(preview.unit)}</strong></div>
            <div><span className="block text-text-muted">Adicionais ({preview.extra})</span><strong>{money(preview.extra * preview.additional)}</strong></div>
            <div><span className="block text-text-muted">Valor calculado</span><strong>{money(preview.total)}</strong></div>
            <div><span className="block text-text-muted">Participantes</span><strong>{employeeIds.length}</strong></div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="form-control"><span className="label-text mb-1">Valor final <span className="text-text-muted">(padrão = calculado)</span></span>
            <input value={finalAmountOverride} onChange={(e) => setFinalAmountOverride(e.target.value)} placeholder={preview ? preview.total.toFixed(2) : "0,00"} className="input input-bordered w-full" />
          </label>
          {diverges && (
            <label className="form-control"><span className="label-text mb-1">Justificativa do ajuste</span>
              <input required value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} className="input input-bordered w-full" />
            </label>
          )}
        </div>

        <div className="modal-action">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving} disabled={saving || !employeeIds.length}>Salvar rascunho</Button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar modal" onClick={onClose}>Fechar</button></form>
    </dialog>
  );
}

function ExpenseDetailModal({ id, canManage, onClose, onChanged }: { id: string | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (id && !dialog.open) dialog.showModal();
    if (!id && dialog.open) dialog.close();
    setError(null); setShowCancel(false); setCancelReason(""); setDetail(null);
    if (id) fetch(`/api/accounts-payable/training-expense/${id}`).then((r) => r.json()).then((b) => setDetail(b.item ?? null)).catch(() => undefined);
  }, [id]);

  if (!id) return <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose} />;

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
    if (!cancelReason.trim()) { setError("Informe o motivo do cancelamento."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/accounts-payable/training-expense/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: cancelReason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao cancelar o lançamento.");
      setDetail(body.item); onChanged(); setShowCancel(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cancelar o lançamento."); }
    finally { setBusy(false); }
  };

  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <div className="modal-box max-w-2xl border border-base-300 bg-base-100">
        {!detail ? <p className="text-sm text-text-muted">Carregando...</p> : (
          <>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-neutral">{detail.training.description}</h2>
              <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
            </div>
            {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-text-muted">Fornecedor</dt><dd className="font-medium">{detail.supplier.tradeName}</dd></div>
              <div><dt className="text-text-muted">Data</dt><dd className="font-medium">{dateBr(detail.trainingDate)}</dd></div>
              <div><dt className="text-text-muted">Quantidade base / adicional snapshot</dt><dd className="font-medium">{detail.baseQuantitySnapshot} · {money(detail.unitPriceSnapshot)} + {money(detail.additionalStudentPriceSnapshot)}/aluno</dd></div>
              <div><dt className="text-text-muted">Participantes</dt><dd className="font-medium">{detail.participantCount}</dd></div>
              <div><dt className="text-text-muted">Valor calculado</dt><dd className="font-medium">{money(detail.calculatedAmount)}</dd></div>
              <div><dt className="text-text-muted">Valor final</dt><dd className="font-medium">{money(detail.finalAmount)}</dd></div>
              {detail.adjustmentReason && <div className="sm:col-span-2"><dt className="text-text-muted">Justificativa do ajuste</dt><dd className="font-medium">{detail.adjustmentReason}</dd></div>}
              {detail.financialRecord && <div className="sm:col-span-2"><dt className="text-text-muted">Registro financeiro</dt><dd className="font-medium">{detail.financialRecord.identifier} — {money(detail.financialRecord.grossAmount)}</dd></div>}
              {detail.cancellationReason && <div className="sm:col-span-2"><dt className="text-text-muted">Motivo do cancelamento</dt><dd className="font-medium">{detail.cancellationReason}</dd></div>}
            </dl>

            <div className="mt-4">
              <strong className="mb-2 block text-sm">Participantes ({detail.participants.length})</strong>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-base-300">
                <table className="w-full text-sm"><thead><tr className="border-b border-border bg-base-200"><th className="p-2 text-left">Colaborador</th><th className="p-2 text-left">Setor</th><th className="p-2 text-right">Valor</th></tr></thead>
                  <tbody>{detail.participants.map((p) => <tr key={p.id} className="border-b border-border last:border-0"><td className="p-2">{p.employee.officialName}</td><td className="p-2">{p.department}</td><td className="p-2 text-right">{money(p.allocatedAmount)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>

            {detail.revisions.length > 0 && (
              <div className="mt-4"><strong className="mb-2 block text-sm">Histórico de revisões</strong>
                <ul className="grid gap-1 text-xs text-text-muted">
                  {detail.revisions.map((r) => <li key={r.id}>Rev. {r.revision} — {money(r.previousTotal)} → {money(r.newTotal)} em {new Date(r.createdAt).toLocaleString("pt-BR")}</li>)}
                </ul>
              </div>
            )}

            {showCancel && (
              <label className="form-control mt-4"><span className="label-text mb-1">Motivo do cancelamento</span>
                <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="input input-bordered w-full" />
              </label>
            )}

            <div className="modal-action flex-wrap">
              {canManage && detail.status === "DRAFT" && <Button onClick={complete} loading={busy} disabled={busy}>Concluir lançamento</Button>}
              {canManage && detail.status !== "CANCELLED" && !showCancel && <Button variant="error" onClick={() => setShowCancel(true)} disabled={busy}>Cancelar lançamento</Button>}
              {canManage && showCancel && <Button variant="error" onClick={cancel} loading={busy} disabled={busy}>Confirmar cancelamento</Button>}
              <Button variant="secondary" onClick={onClose}>Fechar</Button>
            </div>
          </>
        )}
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar modal" onClick={onClose}>Fechar</button></form>
    </dialog>
  );
}

type RateioRowData = { participantId: string; expenseId: string; employeeName: string; costCenter: string; trainingDescription: string; trainingDate: string; amount: string };
type RateioDepartmentData = { department: string; participants: number; uniqueParticipants: number; amount: string; rows: RateioRowData[] };
type RateioExpenseData = { id: string; trainingDescription: string; trainingDate: string; finalAmount: string; allocated: string; financialIdentifier: string | null };
type RateioCardData = {
  supplierId: string; supplierName: string; competence: { year: number; month: number };
  expenses: RateioExpenseData[]; departments: RateioDepartmentData[];
  trainings: number; uniqueParticipants: number; participations: number;
  totalAmount: string; totalAllocated: string; difference: string;
};
type RateioData = { cards: RateioCardData[]; totalAmount: string; totalAllocated: string; difference: string };

const toCents = (value: string) => Math.round(Number(String(value).replace(",", ".")) * 100);
const fromCents = (value: number) => money(value / 100);

function TotalsLine({ total, allocated, difference }: { total: string; allocated: string; difference: string }) {
  const inconsistent = toCents(difference) !== 0;
  return (
    <div className={`mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md border px-3 py-2 text-sm ${inconsistent ? "border-error/40 bg-error/5 text-error" : "border-border"}`} role={inconsistent ? "alert" : undefined}>
      <span>Valor total <strong>{money(total)}</strong></span>
      <span>Rateado <strong>{money(allocated)}</strong></span>
      <span>Diferença <strong>{money(difference)}</strong>{inconsistent && " · inconsistência no rateio"}</span>
    </div>
  );
}

function AllocationEditor({ card, onClose, onSaved }: { card: RateioCardData; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initial = useMemo(() => {
    const values: Record<string, string> = {};
    for (const department of card.departments) for (const row of department.rows) values[row.participantId] = Number(row.amount).toFixed(2);
    return values;
  }, [card]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

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
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <div className="modal-box max-w-3xl border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">Editar rateio · {card.supplierName}</h2>
        <p className="mt-1 text-xs text-text-muted">Redistribui o mesmo valor final de cada lançamento entre os participantes. O total não pode ser alterado por aqui.</p>
        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-4 grid gap-4">
          {sums.map(({ expense, informed, expected, valid }) => (
            <section key={expense.id} className="rounded-md border border-border p-3">
              <strong className="block text-sm">{expense.trainingDescription} · {dateBr(expense.trainingDate)}{expense.financialIdentifier ? ` · ${expense.financialIdentifier}` : ""}</strong>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {(participantsByExpense.get(expense.id) ?? []).map((row) => (
                      <tr key={row.participantId} className="border-b border-border last:border-0">
                        <td className="py-1 pr-2">{row.employeeName}</td>
                        <td className="py-1 pr-2 text-text-muted">{row.department}</td>
                        <td className="w-32 py-1"><input aria-label={`Valor de ${row.employeeName}`} inputMode="decimal" value={values[row.participantId] ?? ""} onChange={(event) => setValues({ ...values, [row.participantId]: event.target.value })} className="input input-bordered input-sm w-full text-right" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={`mt-2 text-xs ${valid ? "text-text-muted" : "text-error"}`}>Total esperado {fromCents(expected)} · informado {fromCents(informed)} · diferença {fromCents(expected - informed)}</p>
            </section>
          ))}
        </div>
        <div className="modal-action">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} loading={saving} disabled={saving || !allValid || !changed.length}>Salvar rateio</Button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar modal" onClick={onClose}>Fechar</button></form>
    </dialog>
  );
}

function RateioTab({ year, month, canManage }: { year: number; month: number; canManage: boolean }) {
  const [data, setData] = useState<RateioData | null>(null);
  const [editing, setEditing] = useState<RateioCardData | null>(null);

  const load = () => fetch(`/api/accounts-payable/training-expense/rateio?year=${year}&month=${month}`).then((r) => r.json()).then(setData).catch(() => undefined);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [year, month]);

  if (!data) return <p className="text-sm text-text-muted">Carregando...</p>;
  if (!data.cards.length) return <div className="card"><EmptyState title="Nenhum rateio nesta competência" description="Conclua ao menos um lançamento de treinamento para ver o rateio por setor." /></div>;

  return (
    <div className="grid gap-4">
      {data.cards.map((card) => {
        const identifiers = card.expenses.map((expense) => expense.financialIdentifier).filter(Boolean) as string[];
        return (
          <AllocationCard
            key={`${card.supplierId}-${card.competence.year}-${card.competence.month}`}
            title={card.supplierName}
            subtitle={`competência ${String(card.competence.month).padStart(2, "0")}/${card.competence.year} · ${card.expenses.length} obrigação(ões)`}
            badge={<Badge tone="success">Concluído</Badge>}
            indicators={[
              { label: "Treinamentos / lançamentos", value: card.trainings },
              { label: "Participantes únicos / setores", value: `${card.uniqueParticipants} / ${card.departments.length}` },
              { label: "Participações", value: card.participations },
              { label: "Valor total · obrigação", value: `${money(card.totalAmount)}${identifiers.length ? ` · ${identifiers.length === 1 ? identifiers[0] : `${identifiers.length} obrigações`}` : ""}` },
            ]}
          >
            <AllocationDepartmentList>
              {card.departments.map((department) => (
                <AllocationDepartmentAccordion
                  key={department.department}
                  name={department.department}
                  summary={`${department.uniqueParticipants} ${department.uniqueParticipants === 1 ? "participante" : "participantes"}${department.participants !== department.uniqueParticipants ? ` · ${department.participants} participações` : ""} · ${money(department.amount)}`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead><tr className="border-b border-border text-left text-xs text-text-muted"><th className="py-2 pr-2">Colaborador</th><th className="py-2 pr-2">Treinamento</th><th className="py-2 pr-2">Data</th><th className="py-2 pr-2">Centro de custo</th><th className="py-2 text-right">Valor</th></tr></thead>
                      <tbody>
                        {department.rows.map((row) => (
                          <tr key={row.participantId} className="border-b border-border last:border-0">
                            <td className="py-2 pr-2">{row.employeeName}</td>
                            <td className="py-2 pr-2">{row.trainingDescription}</td>
                            <td className="whitespace-nowrap py-2 pr-2">{dateBr(row.trainingDate)}</td>
                            <td className="py-2 pr-2">{row.costCenter || "—"}</td>
                            <td className="whitespace-nowrap py-2 text-right">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AllocationDepartmentAccordion>
              ))}
            </AllocationDepartmentList>
            <TotalsLine total={card.totalAmount} allocated={card.totalAllocated} difference={card.difference} />
            <div className="mt-4 flex flex-wrap gap-2">
              {canManage && <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(card)}>Editar rateio</Button>}
              <a href={`/api/accounts-payable/training-expense/rateio/download?year=${year}&month=${month}&supplierId=${card.supplierId}`} className={buttonClassName({ variant: "secondary", size: "sm" })}>Download do rateio XLSX</a>
            </div>
          </AllocationCard>
        );
      })}
      {data.cards.length > 1 && <TotalsLine total={data.totalAmount} allocated={data.totalAllocated} difference={data.difference} />}
      {editing && <AllocationEditor key={editing.supplierId} card={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: { label: string; amount: string }[] }) {
  return (
    <div className="card overflow-x-auto">
      <h3 className="p-3 pb-0 font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="p-3 text-sm text-text-muted">Sem dados nesta competência.</p> : (
        <table className="w-full text-sm"><tbody>{rows.map((row) => <tr key={row.label} className="border-b border-border last:border-0"><td className="p-3">{row.label}</td><td className="p-3 text-right font-medium">{money(row.amount)}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}

function ResumoTab({ year, month }: { year: number; month: number }) {
  const [data, setData] = useState<{ trainingsRealized: number; uniqueParticipants: number; participations: number; suppliers: number; valueTotal: string; bySupplier: { label: string; amount: string }[]; byTraining: { label: string; amount: string }[]; byDepartment: { label: string; amount: string }[] } | null>(null);

  useEffect(() => { fetch(`/api/accounts-payable/training-expense/summary?year=${year}&month=${month}`).then((r) => r.json()).then(setData).catch(() => undefined); }, [year, month]);

  if (!data) return <p className="text-sm text-text-muted">Carregando...</p>;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Treinamentos realizados" value={String(data.trainingsRealized)} />
        <MetricCard label="Participantes únicos" value={String(data.uniqueParticipants)} />
        <MetricCard label="Participações" value={String(data.participations)} />
        <MetricCard label="Fornecedores" value={String(data.suppliers)} />
        <MetricCard label="Valor total" value={money(data.valueTotal)} accent />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryTable title="Valor por fornecedor" rows={data.bySupplier} />
        <SummaryTable title="Valor por treinamento" rows={data.byTraining} />
        <SummaryTable title="Valor por departamento" rows={data.byDepartment} />
      </div>
    </div>
  );
}

export default function TrainingExpensePage() {
  const router = useRouter();
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = competence.split("-").map(Number);
  const [tab, setTab] = useState<"lancamentos" | "rateio" | "resumo">("lancamentos");
  const [items, setItems] = useState<ExpenseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
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
    fetch("/api/auth/me").then((r) => r.json()).then((me) => { setCurrentUserEmail(me.email ?? null); setPermissions(me.permissions ?? []); }).catch(() => undefined);
    fetch("/api/administrative-entities").then((r) => r.json()).then((b) => setSuppliers(b.items ?? [])).catch(() => undefined);
  }, []);

  const visible = useMemo(() => items, [items]);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };

  return (
    <div className="flex flex-1 flex-col">
      <CorporateHeader currentUserEmail={currentUserEmail} onLogout={logout} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader
          backHref="/pagamentos"
          backLabel="Despesas"
          eyebrow="Despesas"
          title="Treinamentos"
          description="Treinamentos realizados, participantes, custo e rateio por setor nesta competência."
          actions={canManage && <Button aura onClick={() => setShowNew(true)}>+ Registrar treinamento</Button>}
        />

        <section className="card p-5">
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            <span>Competência</span>
            <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className="rounded-md border border-border px-3 py-2" />
          </label>
        </section>

        {error && <p className="rounded-md border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</p>}

        <div role="tablist" className="tabs tabs-boxed w-fit">
          <button role="tab" className={`tab ${tab === "lancamentos" ? "tab-active" : ""}`} onClick={() => setTab("lancamentos")}>Lançamentos</button>
          <button role="tab" className={`tab ${tab === "rateio" ? "tab-active" : ""}`} onClick={() => setTab("rateio")}>Rateio</button>
          <button role="tab" className={`tab ${tab === "resumo" ? "tab-active" : ""}`} onClick={() => setTab("resumo")}>Resumo</button>
        </div>

        {tab === "lancamentos" && (
          <div role="tabpanel" className="grid gap-4">
            <FilterBar>
              <input aria-label="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por treinamento" className="input input-bordered w-full sm:col-span-2" />
              <select aria-label="Fornecedor" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="select select-bordered w-full">
                <option value="">Todos os fornecedores</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
              </select>
              <select aria-label="Situação" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select select-bordered w-full">
                <option value="">Todas as situações</option>
                <option value="DRAFT">Rascunho</option>
                <option value="COMPLETED">Concluído</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </FilterBar>

            {!loading && visible.length === 0 ? (
              <div className="card"><EmptyState title="Nenhum lançamento nesta competência" description="Registre um treinamento realizado para começar." /></div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead><tr className="border-b border-border bg-base-200"><th className="p-3 text-left">Data</th><th className="p-3 text-left">Treinamento</th><th className="p-3 text-left">Fornecedor</th><th className="p-3 text-right">Participantes</th><th className="p-3 text-right">Valor</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Ações</th></tr></thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="p-3">{dateBr(item.trainingDate)}</td>
                        <td className="p-3 font-medium">{item.training.description}</td>
                        <td className="p-3">{item.supplier.tradeName}</td>
                        <td className="p-3 text-right">{item.participantCount}</td>
                        <td className="whitespace-nowrap p-3 text-right font-semibold">{money(item.finalAmount)}</td>
                        <td className="p-3 text-center"><Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge></td>
                        <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => setSelectedId(item.id)}>Visualizar</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "rateio" && <div role="tabpanel"><RateioTab year={year} month={month} canManage={canManage} /></div>}
        {tab === "resumo" && <div role="tabpanel"><ResumoTab year={year} month={month} /></div>}
      </main>

      <NewExpenseModal open={showNew} year={year} month={month} onClose={() => setShowNew(false)} onCreated={load} />
      <ExpenseDetailModal id={selectedId} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={load} />
    </div>
  );
}
