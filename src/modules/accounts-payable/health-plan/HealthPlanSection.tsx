"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence changes load a persisted server snapshot */
// Seção "Plano de Saúde" de Despesas: upload do "Analítico Fatura Mensal" da operadora (PDF) → extração por titular
// (dependentes agrupados pela credencial) → rateio por Cobrado. Cada PDF é uma fatura com obrigação própria; o Rateio
// junta as faturas do mesmo fornecedor na competência (um card, um XLSX). Estado e chamadas de API ficam aqui; toda
// conferência de valores é do servidor (Cobrado = Valor Bruto).
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, ListTree, UserX, XCircle } from "lucide-react";
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
  const [file, setFile] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [imported, setImported] = useState<Invoice | null>(null);
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

  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file || !entityId) return;
    setBusy(true); setError(null);
    try {
      const data = new FormData(); data.set("file", file); data.set("administrativeEntityId", entityId);
      if (competenceMode === "selected") { data.set("year", String(year)); data.set("month", String(month)); }
      const response = await fetch("/api/accounts-payable/health-plan", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível processar o PDF.");
      const invoice = body.invoice as Invoice;
      setImported(invoice); setFile(null);
      const target = `${invoice.competence.year}-${String(invoice.competence.month).padStart(2, "0")}`;
      if (target === competence) await load(); else setCompetence(target);
      toast.success(`Fatura ${invoice.obligation} importada: ${invoice.holderCount} titulares, ${money(invoice.totalAmount)}.`);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Falha ao importar."; setError(message); toast.error(message, "Fatura não importada"); }
    finally { setBusy(false); }
  }
  async function confirmCancel(reason: string) {
    if (!cancelTarget) return; setCancelling(true); setCancelError(null);
    try {
      const response = await fetch(`/api/accounts-payable/health-plan/${cancelTarget}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, confirmation: "EXCLUIR" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível excluir.");
      setCancelTarget(null); if (imported?.id === cancelTarget) setImported(null); await load();
    } catch (cause) { setCancelError(cause instanceof Error ? cause.message : "Não foi possível excluir."); } finally { setCancelling(false); }
  }

  const list = useMemo(() => invoices ?? [], [invoices]);
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
          <form onSubmit={upload} className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <Card className="grid gap-4">
              <CardHeader titleAs="h3" title="Importar fatura" description="Um PDF por fatura. A soma de Cobrado precisa fechar com o Valor Bruto do PDF; a mesma obrigação não é importada duas vezes." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cadastro da obrigação" required helper={entities.some(isHealthPlan) ? undefined : "Nenhum cadastro com área Plano de Saúde: mostrando todos."}>{(control) => <select {...control} required className={textInputClassName} value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select>}</Field>
                <Field label="Competência da fatura">{(control) => <select {...control} className={textInputClassName} value={competenceMode} onChange={(event) => setCompetenceMode(event.target.value as "due" | "selected")}><option value="due">Mês do vencimento (do PDF)</option><option value="selected">Competência selecionada ({monthLabel})</option></select>}</Field>
              </div>
              <UploadDropzone label="PDF da fatura" file={file} onFileSelect={(selected) => { setFile(selected); setError(null); }} onClear={() => setFile(null)} accept=".pdf,application/pdf" maxSize={MAX_FILE} helperText="Analítico Fatura Mensal com texto copiável." />
              {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
              <div className="flex justify-end"><Button type="submit" loading={busy} disabled={busy || !file || !entityId} aura={Boolean(file && entityId)}>Processar PDF / Gerar Rateio</Button></div>
            </Card>
          </form>
          {imported && <ImportResult invoice={imported} />}
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

function ImportResult({ invoice }: { invoice: Invoice }) {
  const missing = invoice.allocations.filter((row) => !row.employeeId).length;
  return (
    <Card className="grid gap-3" as="section" aria-label="Resultado da importação">
      <CardHeader titleAs="h3" title={`Fatura ${invoice.obligation} importada`} description={`${invoice.provider} · ${invoice.fileName} · vencimento ${dateBr(invoice.dueDate)} · competência ${String(invoice.competence.month).padStart(2, "0")}/${invoice.competence.year}`} actions={<StatusBadge tone={missing ? "warning" : "success"}>{missing ? `${missing} não localizado(s)` : "Todos localizados"}</StatusBadge>} />
      <CompetenceSummary className="xl:grid-cols-5" items={[
        { label: "Contratos (PDF)", value: invoice.contracts.map((contract) => contract.code).join(", "), helper: invoice.contracts[0]?.name },
        { label: "Titulares", value: invoice.holderCount },
        { label: "Vidas", value: invoice.beneficiaryCount },
        { label: "Valor bruto (PDF)", value: money(invoice.grossAmount) },
        { label: "Cobrado (conferido)", value: money(invoice.totalAmount), helper: invoice.financialRecord?.identifier, emphasis: true },
      ]} />
    </Card>
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
