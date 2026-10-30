"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence changes load a persisted server snapshot */
// Seção "Plano de Saúde" de Despesas: upload do "Analítico Fatura Mensal" da operadora (PDF) → extração por titular
// (dependentes agrupados pela credencial) → rateio por Cobrado. Cada PDF é uma fatura com obrigação própria; o Rateio
// junta as faturas do mesmo fornecedor na competência (um card, um XLSX). Estado e chamadas de API ficam aqui; toda
// conferência de valores é do servidor (Cobrado = Valor Bruto).
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, ListTree, UserX, X, XCircle } from "lucide-react";
import clsx from "clsx";
import { AllocationViews } from "@/components/allocation/AllocationViews";
import { Badge, Button, buttonClassName, Card, CardHeader, DataTable, DeletionModal, EmptyState, FeedbackAlert, Field, StatusBadge, UploadDropzone, textInputClassName, useToast, type DataTableColumn } from "@/components/ui";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { money, moneyCents } from "@/modules/accounts-payable/breakfast/ui/format";
import { normalizeAllocationRow, type AllocationViewId } from "@/modules/accounts-payable/shared/allocation-views";
import { CompetenceSummary } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import { BenefitCompetenceContext, BenefitHistory, BenefitWorkspace, type BenefitTab } from "@/modules/accounts-payable/shared/ui/BenefitWorkspace";

type Entity = { id: string; tradeName: string; activityArea: string };
type Beneficiary = { credential: string; name: string; relationship: string; plan: string; contractCode: string; chargedCents: number };
type Allocation = { id: string; holderName: string; holderCpf: string; employeeId: string | null; employeeName: string; company: string; companyId: string | null; department: string | null; costCenter: string | null; amount: string; beneficiaryCount: number; beneficiaries: Beneficiary[] };
type Invoice = {
  id: string; fileName: string; provider: string; obligation: string; dueDate: string | null; grossAmount: string; totalAmount: string; holderCount: number; beneficiaryCount: number;
  contracts: { code: string; name: string }[];
  administrativeEntity: { id: string; tradeName: string };
  financialRecord: { identifier: string } | null;
  competence: { year: number; month: number };
  allocations: Allocation[];
};

const MAX_FILE = 15 * 1024 * 1024;
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
const isHealthPlan = (entity: Entity) => /saude|plano/.test(normalize(entity.activityArea));
const dateBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const notFound = (invoices: Invoice[]) => invoices.flatMap((invoice) => invoice.allocations.filter((row) => !row.employeeId).map((row) => ({ ...row, obligation: invoice.obligation })));

export function HealthPlanSection() {
  const toast = useToast();
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = competence.split("-").map(Number);
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  const [tab, setTab] = useState<BenefitTab>("operacao");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [competenceMode, setCompetenceMode] = useState<"due" | "selected">("due");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/accounts-payable/health-plan?year=${year}&month=${month}`); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setInvoices(body.invoices);
  }, [year, month]);
  useEffect(() => { setInvoices(null); load().catch(() => setError("Falha ao carregar a competência.")); }, [load]);
  useEffect(() => {
    fetch("/api/administrative-entities?q=").then((r) => r.json()).then((body) => {
      const items: Entity[] = body.items ?? [];
      const matching = items.filter(isHealthPlan);
      setEntities(matching.length ? matching : items);
      if (matching.length === 1) setEntityId(matching[0].id);
    }).catch(() => undefined);
  }, []);

  const enqueue = (file: File) => setQueue((current) => current.some((item) => item.status !== "done" && item.file.name === file.name && item.file.size === file.size) ? current : [...current, { id: `${Date.now()}-${Math.random()}`, file, status: "pending" }]);
  const patchItem = (id: string, patch: Partial<QueueItem>) => setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  // Fila de extração: um PDF por vez (cada importação gera obrigação numa transação serializável no servidor);
  // erro em um arquivo não para os demais. Fechar a página interrompe os que ainda estão pendentes.
  async function processQueue(event: FormEvent) {
    event.preventDefault(); if (!entityId || busy) return;
    const pending = queue.filter((item) => item.status === "pending" || item.status === "error");
    if (!pending.length) return;
    setBusy(true); setError(null);
    let last: Invoice | null = null, failed = 0;
    for (const item of pending) {
      patchItem(item.id, { status: "processing", message: undefined });
      try {
        const data = new FormData(); data.set("file", item.file); data.set("administrativeEntityId", entityId);
        if (competenceMode === "selected") { data.set("year", String(year)); data.set("month", String(month)); }
        const response = await fetch("/api/accounts-payable/health-plan", { method: "POST", body: data });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Não foi possível processar o PDF.");
        last = body.invoice as Invoice;
        patchItem(item.id, { status: "done", invoice: last });
      } catch (cause) { failed += 1; patchItem(item.id, { status: "error", message: cause instanceof Error ? cause.message : "Falha ao importar." }); }
    }
    setBusy(false);
    if (last) {
      const target = `${last.competence.year}-${String(last.competence.month).padStart(2, "0")}`;
      if (target === competence) await load().catch(() => undefined); else setCompetence(target);
    }
    const imported = pending.length - failed;
    if (failed) toast.error(`${imported} de ${pending.length} PDF(s) importado(s); ${failed} com erro. Veja a fila.`, "Fila de importação");
    else toast.success(`${imported} PDF(s) importado(s).`);
  }
  async function confirmCancel(reason: string) {
    if (!cancelTarget) return; setCancelling(true); setCancelError(null);
    try {
      const response = await fetch(`/api/accounts-payable/health-plan/${cancelTarget}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, confirmation: "EXCLUIR" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível excluir.");
      setCancelTarget(null); await load();
    } catch (cause) { setCancelError(cause instanceof Error ? cause.message : "Não foi possível excluir."); } finally { setCancelling(false); }
  }

  const list = useMemo(() => invoices ?? [], [invoices]);
  const waiting = queue.filter((item) => item.status === "pending" || item.status === "error").length;
  const totalCents = list.reduce((sum, invoice) => sum + amountToCents(invoice.totalAmount), 0);
  const missing = notFound(list);
  const lives = list.reduce((sum, invoice) => sum + invoice.beneficiaryCount, 0);
  const historyRows = list.map((invoice) => ({
    id: invoice.id,
    title: `${invoice.administrativeEntity.tradeName} · obrigação ${invoice.obligation}`,
    detail: `${invoice.fileName} · vencimento ${dateBr(invoice.dueDate)}`,
    status: invoice.financialRecord ? { tone: "success" as const, label: "Obrigação gerada" } : { tone: "warning" as const, label: "Sem obrigação" },
    version: `${invoice.holderCount} titulares`,
    obligation: invoice.financialRecord?.identifier ?? null,
    amount: money(invoice.totalAmount),
    actions: <span className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setTab("rateio")} aria-label={`Ver rateio da obrigação ${invoice.obligation}`}><ListTree size={14} aria-hidden="true" />Rateio</Button>
      <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => setCancelTarget(invoice.id)} aria-label={`Cancelar fatura ${invoice.obligation}`}><XCircle size={14} aria-hidden="true" />Cancelar</Button>
    </span>,
  }));

  return <>
    <BenefitWorkspace
      title="Plano de Saúde"
      description="Upload do Analítico Fatura Mensal da operadora (PDF). Valor por titular = Cobrado do titular + dependentes; titular localizado pelo CPF no cadastro de colaboradores."
      tab={tab}
      onTabChange={setTab}
      context={
        <BenefitCompetenceContext
          id="plano-saude-competence"
          competence={competence}
          onCompetenceChange={setCompetence}
          loading={invoices === null && !error}
          items={[
            { label: "Competência", value: monthLabel },
            { label: "Faturas", value: list.length, helper: list.length ? `${list.filter((invoice) => invoice.financialRecord).length} com obrigação` : "Nenhuma importada" },
            { label: "Titulares", value: list.reduce((sum, invoice) => sum + invoice.holderCount, 0) },
            { label: "Vidas", value: lives, helper: "Titulares + dependentes" },
            { label: "Não localizados", value: missing.length, helper: missing.length ? "Sem cadastro pelo CPF" : "Todos localizados" },
            { label: "Total cobrado", value: moneyCents(totalCents), emphasis: true },
          ]}
        />
      }
      operation={
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <form onSubmit={processQueue} className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <Card className="grid gap-4">
              <CardHeader titleAs="h3" title="Importar faturas" description="Selecione um ou vários PDFs (um por fatura); a fila processa um de cada vez. A soma de Cobrado precisa fechar com o Valor Bruto de cada PDF; a mesma obrigação não é importada duas vezes." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cadastro da obrigação" required helper={entities.some(isHealthPlan) ? undefined : "Nenhum cadastro com área Plano de Saúde: mostrando todos."}>{(control) => <select {...control} required className={textInputClassName} value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select>}</Field>
                <Field label="Competência da fatura">{(control) => <select {...control} className={textInputClassName} value={competenceMode} onChange={(event) => setCompetenceMode(event.target.value as "due" | "selected")}><option value="due">Mês do vencimento (do PDF)</option><option value="selected">Competência selecionada ({monthLabel})</option></select>}</Field>
              </div>
              <UploadDropzone label="PDFs das faturas" file={null} multiple disabled={busy} onFileSelect={(selected) => { enqueue(selected); setError(null); }} accept=".pdf,application/pdf" maxSize={MAX_FILE} helperText="Analítico Fatura Mensal com texto copiável." />
              <ImportQueue items={queue} busy={busy} onRemove={(id) => setQueue((current) => current.filter((item) => item.id !== id))} onClearDone={() => setQueue((current) => current.filter((item) => item.status !== "done"))} />
              {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
              <div className="flex justify-end"><Button type="submit" loading={busy} disabled={busy || !waiting || !entityId} aura={Boolean(waiting && entityId)}>{waiting > 1 ? `Processar ${waiting} PDFs / Gerar Rateio` : "Processar PDF / Gerar Rateio"}</Button></div>
            </Card>
          </form>
          <MissingHolders rows={missing} />
        </div>
      }
      allocation={<HealthPlanAllocationView invoices={list} monthLabel={monthLabel} onCancel={setCancelTarget} />}
      history={<BenefitHistory caption={`Faturas de Plano de Saúde · ${monthLabel}`} rows={historyRows} emptyTitle="Nenhuma fatura nesta competência" emptyDescription="As faturas importadas na Operação aparecem aqui, com a obrigação gerada." />}
    />
    <DeletionModal open={cancelTarget !== null} title="Cancelar a fatura?" description="A fatura sai do rateio e a obrigação é cancelada." count={1} requireKeyword busy={cancelling} onClose={() => { if (!cancelling) setCancelTarget(null); }} onConfirm={confirmCancel} />
    {cancelError && <FeedbackAlert status="error">{cancelError}</FeedbackAlert>}
  </>;
}

type QueueItem = { id: string; file: File; status: "pending" | "processing" | "done" | "error"; message?: string; invoice?: Invoice };
const QUEUE_STATUS = { pending: { tone: "neutral", label: "Na fila" }, processing: { tone: "info", label: "Processando" }, done: { tone: "success", label: "Importado" }, error: { tone: "danger", label: "Erro" } } as const;

// Fila de PDFs (só exibição): status por arquivo e, quando importado, o resumo conferido da fatura.
function ImportQueue({ items, busy, onRemove, onClearDone }: { items: QueueItem[]; busy: boolean; onRemove: (id: string) => void; onClearDone: () => void }) {
  if (!items.length) return null;
  const columns: DataTableColumn<QueueItem>[] = [
    { id: "file", header: "Arquivo", rowHeader: true, wrap: true, cell: (item) => <span className="grid">{item.file.name}{item.message && <span className="text-caption text-danger-text">{item.message}</span>}</span> },
    { id: "status", header: "Situação", cell: (item) => <StatusBadge tone={QUEUE_STATUS[item.status].tone}>{QUEUE_STATUS[item.status].label}</StatusBadge> },
    { id: "obligation", header: "Fatura", cell: (item) => item.invoice ? <span className="grid tabular-nums">{item.invoice.obligation}<span className="text-caption text-foreground-muted">venc. {dateBr(item.invoice.dueDate)} · {item.invoice.financialRecord?.identifier ?? "—"}</span></span> : "—" },
    { id: "holders", header: "Titulares", numeric: true, cell: (item) => item.invoice ? <span className="grid">{item.invoice.holderCount}{item.invoice.allocations.some((row) => !row.employeeId) && <span className="text-caption text-warning-text">{item.invoice.allocations.filter((row) => !row.employeeId).length} não localizado(s)</span>}</span> : "—" },
    { id: "amount", header: "Cobrado", numeric: true, cell: (item) => (item.invoice ? <strong>{money(item.invoice.totalAmount)}</strong> : "—") },
  ];
  return (
    <div className="grid gap-2">
      <DataTable caption="Fila de importação" columns={columns} rows={items} getRowId={(item) => item.id} density="dense" minWidth="720px" actionsLabel="Ações"
        rowActions={(item) => item.status !== "processing" && !busy ? <Button size="sm" variant="ghost" onClick={() => onRemove(item.id)} aria-label={`Remover ${item.file.name} da fila`}><X size={14} aria-hidden="true" />Remover</Button> : null} />
      {items.some((item) => item.status === "done") && !busy && <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={onClearDone}>Limpar importados</Button></div>}
    </div>
  );
}

function MissingHolders({ rows }: { rows: ReturnType<typeof notFound> }) {
  if (!rows.length) return null;
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { id: "name", header: "Titular (PDF)", rowHeader: true, wrap: true, cell: (row) => row.holderName },
    { id: "cpf", header: "CPF", cell: (row) => <span className="tabular-nums">{row.holderCpf}</span> },
    { id: "obligation", header: "Fatura", cell: (row) => <span className="tabular-nums">{row.obligation}</span> },
    { id: "lives", header: "Vidas", numeric: true, cell: (row) => row.beneficiaryCount },
    { id: "amount", header: "Cobrado", numeric: true, cell: (row) => <strong>{money(row.amount)}</strong> },
  ];
  return (
    <Card className="grid gap-3" as="section" aria-label="Titulares não localizados">
      <FeedbackAlert status="warning"><span className="inline-flex items-center gap-1.5"><UserX size={14} aria-hidden="true" />{rows.length} titular(es) sem colaborador com o mesmo CPF. Entram no rateio como Sem empresa / Sem centro de custo / Sem departamento; cadastre o CPF e reimporte a fatura para corrigir.</span></FeedbackAlert>
      <DataTable caption="Titulares não localizados" columns={columns} rows={rows} getRowId={(row) => row.id} density="dense" minWidth="640px" />
    </Card>
  );
}

// Um card por fornecedor na competência: as faturas (PDFs) somadas no mesmo rateio; cancelamento por fatura.
function HealthPlanAllocationView({ invoices, monthLabel, onCancel }: { invoices: Invoice[]; monthLabel: string; onCancel: (invoiceId: string) => void }) {
  if (!invoices.length) return <Card><EmptyState title="Nenhuma fatura nesta competência." description="Importe o PDF da operadora na Operação para gerar o rateio." /></Card>;
  const suppliers = new Map<string, Invoice[]>();
  for (const invoice of invoices) suppliers.set(invoice.administrativeEntity.id, [...(suppliers.get(invoice.administrativeEntity.id) ?? []), invoice]);
  return <div className="grid gap-4">{[...suppliers.values()].map((group) => <SupplierAllocation key={group.map((invoice) => invoice.id).join("-")} invoices={group} monthLabel={monthLabel} onCancel={onCancel} />)}</div>;
}

function SupplierAllocation({ invoices, monthLabel, onCancel }: { invoices: Invoice[]; monthLabel: string; onCancel: (invoiceId: string) => void }) {
  const [view, setView] = useState<AllocationViewId>("companyCostCenterDepartment");
  const [first] = invoices;
  const rows = invoices.flatMap((invoice) => invoice.allocations);
  const viewRows = rows.map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: amountToCents(row.amount), source: row }));
  const rateadoCents = viewRows.reduce((sum, row) => sum + row.cents, 0);
  const totalCents = invoices.reduce((sum, invoice) => sum + amountToCents(invoice.totalAmount), 0);
  const grossCents = invoices.reduce((sum, invoice) => sum + amountToCents(invoice.grossAmount), 0);
  const diff = rateadoCents - grossCents;
  const columns: DataTableColumn<Allocation>[] = [
    { id: "name", header: "Titular", rowHeader: true, width: "16rem", wrap: true, cell: (row) => <span className="grid">{row.employeeName}{!row.employeeId && <Badge tone="warning" className="w-fit">Não localizado</Badge>}</span> },
    { id: "dependents", header: "Dependentes", wrap: true, className: "min-w-[14rem] text-foreground-muted", cell: (row) => [...new Map(row.beneficiaries.filter((item) => !item.credential.endsWith("-00")).map((item) => [item.name, `${item.name} (${item.relationship.toLocaleLowerCase("pt-BR")})`])).values()].join("; ") || "—" },
    { id: "lives", header: "Vidas", numeric: true, cell: (row) => row.beneficiaryCount },
    { id: "amount", header: "Cobrado", numeric: true, cell: (row) => <strong>{money(row.amount)}</strong> },
  ];
  return (
    <Card padding="none" as="article" className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5">
        <CardHeader title={first.administrativeEntity.tradeName} description={`Competência ${monthLabel} · ${invoices.length} ${invoices.length === 1 ? "fatura" : "faturas"} (obrigações ${invoices.map((invoice) => invoice.obligation).join(", ")})`} actions={<StatusBadge tone="success">Concluído</StatusBadge>} />
        <CompetenceSummary className="xl:grid-cols-4" items={[
          { label: "Titulares", value: rows.length, helper: `${rows.filter((row) => !row.employeeId).length} não localizado(s)` },
          { label: "Vidas", value: rows.reduce((sum, row) => sum + row.beneficiaryCount, 0) },
          { label: "Valor bruto (PDFs)", value: moneyCents(grossCents) },
          { label: "Total cobrado · obrigações", value: moneyCents(totalCents), helper: invoices.map((invoice) => invoice.financialRecord?.identifier).filter(Boolean).join(" · ") || undefined, emphasis: true },
        ]} />
        <AllocationViews
          rows={viewRows}
          value={view}
          onValueChange={setView}
          expectedCents={totalCents}
          renderLeaf={(leafRows, node) => (
            <DataTable caption={`${first.administrativeEntity.tradeName} — ${node.label}`} columns={columns} rows={leafRows.map((row) => row.source).sort((a, b) => comparePtBr(a.employeeName, b.employeeName))} getRowId={(row) => row.id} density="dense" minWidth="720px" />
          )}
        />
        <dl role={diff !== 0 ? "alert" : undefined} className={clsx("flex flex-wrap gap-x-6 gap-y-1 rounded-control border px-3 py-2 text-body tabular-nums", diff !== 0 ? "border-danger/40 bg-danger-soft text-danger-text" : "border-border bg-surface-muted")}>
          {diff !== 0 && <XCircle size={16} aria-hidden="true" className="self-center" />}
          {([["Valor bruto", moneyCents(grossCents)], ["Rateado", moneyCents(rateadoCents)], ["Diferença", moneyCents(diff)]] as const).map(([label, value]) => (
            <div key={label} className="flex gap-1.5"><dt className="text-foreground-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
        {/* o servidor junta no mesmo XLSX as faturas ativas do fornecedor na competência */}
        <a href={`/api/accounts-payable/health-plan/${first.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}><Download size={14} aria-hidden="true" />Download do rateio XLSX</a>
        <span className="ml-auto flex flex-wrap gap-2">
          {invoices.map((invoice) => <Button key={invoice.id} size="sm" variant="error" onClick={() => onCancel(invoice.id)}>{invoices.length > 1 ? `Cancelar ${invoice.obligation} · ${money(invoice.totalAmount)}` : "Cancelar fatura"}</Button>)}
        </span>
      </div>
    </Card>
  );
}
