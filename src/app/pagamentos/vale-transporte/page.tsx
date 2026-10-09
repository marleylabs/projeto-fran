"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence changes load a persisted server snapshot */
// Vale Transporte (MA): Preenchimento → Rateio → Resumo. Fase 7G: apresentação no Design System (Tabs, DataTable,
// CurrencyInput, CalculatedValue, Dialog, AllocationViews), no mesmo padrão da Cesta e do Café. Estado, chamadas de API,
// prévia de cálculo (calculatePassagesToReceive / calculateTransitVoucherEmployeeTotal) e save continuam AQUI; os
// componentes em transit-voucher/ui só exibem. O servidor recalcula tudo ao salvar.
import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CompetenceCalendar, HolidayModal } from "@/components/allocation/CompetenceHolidays";
import { CompanyModal, companyLabel, normalizeText as normalize, type Company } from "@/components/allocation/CompanyPicker";
import { Button, CalculatedValue, Card, CardHeader, CurrencyInput, DeletionModal, Dialog, FeedbackAlert, Field, PageHeader, TabPanel, Tabs, TextInput, textInputClassName, useToast } from "@/components/ui";
import { type CollaboratorOption } from "@/components/CollaboratorCombobox";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import {
  assertPassagesToReceive, calculatePassagesToReceive, calculateTransitVoucherEmployeeTotal,
  parseFareToCents, type TransitObservationKind,
} from "@/modules/accounts-payable/transit-voucher/calculations";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { CompetenceSummary } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import { TransitAllocationView } from "@/modules/accounts-payable/transit-voucher/ui/TransitAllocationView";
import { TransitFillTable } from "@/modules/accounts-payable/transit-voucher/ui/TransitFillTable";
import { TransitSummaryView, type TransitSummaryGroup } from "@/modules/accounts-payable/transit-voucher/ui/TransitSummaryView";
import { dayMonth, money, moneyCents, people } from "@/modules/accounts-payable/transit-voucher/ui/format";
import type { TransitAllocationRow as Allocation, TransitContext as Context, TransitEntity as Entity, TransitEntryValue as EntryValue, TransitMapData as MapData } from "@/modules/accounts-payable/transit-voucher/ui/types";

const STAGES = [{ value: "preenchimento", label: "Preenchimento" }, { value: "rateio", label: "Rateio" }, { value: "resumo", label: "Resumo" }];
const cents = (value: string | number) => Math.round(Number(value) * 100);
// O mapa é a fonte histórica: tarifa e dias úteis vêm dos registros do próprio mapa, nunca da competência atual.
const mapBase = (map: MapData | undefined) => { const row = map?.allocations.find((item) => item.workingDays !== null && item.fareUnitPrice !== null); return row ? { workingDays: row.workingDays as number, fareUnitPrice: Number(row.fareUnitPrice).toFixed(2) } : null; };
const acceptsMA = (value: string) => value.toUpperCase().split(/[\/,;]/).map((part) => part.trim()).includes("MA");
const isInt = (value: string) => /^-?\d+$/.test(value.trim());
// CurrencyInput ↔ texto da tarifa guardado pela tela (o mesmo texto "4.20" de antes vai para o servidor, que valida com
// parseFareToCents). Texto que não é valor com até 2 casas fica vazio no campo; a digitação vira texto com 2 casas.
const fareValue = (text: string) => { const normalized = text.trim().replace(",", "."); return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : null; };
const fareText = (value: number | null) => (value === null ? "" : value.toFixed(2));

function CorrectionModal({ target, companies, onClose, onSaved }: { target: { mapId: string; row: Allocation } | null; companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const formId = `${useId()}-correction`;
  const [form, setForm] = useState({ companyText: "", qty: "", diff: "0", discount: "0", obsType: "" as "" | TransitObservationKind, obsDetails: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (target) { const row = target.row; setError(null); setForm({ companyText: row.company, qty: String(row.dailyPassageQuantity ?? ""), diff: String(row.previousPassageDifference ?? 0), discount: String(row.passageDiscount ?? 0), obsType: row.observationType ?? "", obsDetails: row.observationDetails ?? "", reason: "" }); }
  }, [target]);
  const company = companies.find((item) => normalize(companyLabel(item)) === normalize(form.companyText) || normalize(item.legalName) === normalize(form.companyText));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!target?.row.employeeId) return;
    if (!company) return setError("Selecione uma empresa cadastrada.");
    if (!isInt(form.qty) || !isInt(form.diff) || !isInt(form.discount)) return setError("Passagem por dia, diferença e descontos devem ser números inteiros.");
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/accounts-payable/transit-voucher/${target.mapId}/entries/${target.row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: form.reason, entry: { employeeId: target.row.employeeId, companyId: company.id, dailyPassageQuantity: Number(form.qty), previousPassageDifference: Number(form.diff), passageDiscount: Number(form.discount), observationType: form.obsType || null, observationDetails: form.obsDetails.trim() || null } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Falha ao corrigir.");
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao corrigir."); } finally { setBusy(false); }
  }
  const row = target?.row;
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Corrigir lançamento"
      description={`${row?.employeeName ?? ""} · o registro atual é cancelado (com histórico) e um novo é gerado, preservando a base histórica do lançamento; só os campos que você alterar mudam o resultado.`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" form={formId} loading={busy} disabled={busy || !form.reason.trim()}>Salvar correção</Button></>}
    >
      <form id={formId} onSubmit={submit} className="grid gap-4">
        {row && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-control border border-border bg-surface-muted p-3 text-caption sm:grid-cols-4" aria-label="Base histórica preservada">
            <div><dt className="text-foreground-muted">Tarifa</dt><dd className="font-semibold tabular-nums">{row.fareUnitPrice ? money(row.fareUnitPrice) : "—"}</dd></div>
            <div><dt className="text-foreground-muted">Dias úteis</dt><dd className="font-semibold tabular-nums">{row.workingDays ?? "—"}</dd></div>
            <div><dt className="text-foreground-muted">Departamento</dt><dd className="font-semibold">{row.department ?? "—"}</dd></div>
            <div><dt className="text-foreground-muted">Centro de custo</dt><dd className="font-semibold">{row.costCenter ?? "—"}</dd></div>
          </dl>
        )}
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        <Field label="Empresa">{(control) => <><input {...control} list="vt-companies-correction" className={textInputClassName} value={form.companyText} onChange={(event) => setForm({ ...form, companyText: event.target.value })} /><datalist id="vt-companies-correction">{companies.map((item) => <option key={item.id} value={companyLabel(item)} />)}</datalist></>}</Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Passagem por dia">{(control) => <TextInput {...control} type="number" inputMode="numeric" step={1} className="tabular-nums" value={form.qty} onChange={(event) => setForm({ ...form, qty: event.target.value })} />}</Field>
          <Field label="Diferença mês anterior">{(control) => <TextInput {...control} type="number" inputMode="numeric" step={1} className="tabular-nums" value={form.diff} onChange={(event) => setForm({ ...form, diff: event.target.value })} />}</Field>
          <Field label="Descontos">{(control) => <TextInput {...control} type="number" inputMode="numeric" step={1} className="tabular-nums" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} />}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label="Observação">{(control) => <select {...control} className={textInputClassName} value={form.obsType} onChange={(event) => setForm({ ...form, obsType: event.target.value as "" | TransitObservationKind })}><option value="">—</option><option value="VACATION">Férias</option><option value="OTHER">Outros</option></select>}</Field>
          {form.obsType && <Field label="Detalhes">{(control) => <TextInput {...control} value={form.obsDetails} onChange={(event) => setForm({ ...form, obsDetails: event.target.value })} />}</Field>}
        </div>
        <Field label="Motivo da correção" required>{(control) => <TextInput {...control} required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />}</Field>
      </form>
    </Dialog>
  );
}

export default function TransitVoucherPage() {
  const toast = useToast();
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = competence.split("-").map(Number);
  const [tab, setTab] = useState<"preenchimento" | "rateio" | "resumo">("preenchimento");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [configs, setConfigs] = useState<Record<string, { qty: number; companyId: string | null }>>({});
  const [ctx, setCtx] = useState<Context | null>(null);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [entityId, setEntityId] = useState("");
  const [fareInput, setFareInput] = useState("4.20");
  const [holidayDate, setHolidayDate] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, EntryValue>>({});
  const [bulkCompany, setBulkCompany] = useState("");
  const [companyModal, setCompanyModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ mapId: string; ids: string[] | "map" } | null>(null);
  const [correcting, setCorrecting] = useState<{ mapId: string; row: Allocation } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    const response = await fetch(`/api/accounts-payable/transit-voucher/context?year=${year}&month=${month}`); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setCtx(body); setFareInput(body.fareUnitPrice);
  }, [year, month]);
  const loadMaps = useCallback(async () => {
    const response = await fetch(`/api/accounts-payable/transit-voucher?year=${year}&month=${month}`); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setMaps(body.competence?.maps ?? []);
  }, [year, month]);
  const reload = useCallback(async () => { await Promise.all([loadContext(), loadMaps()]); }, [loadContext, loadMaps]);
  useEffect(() => { reload().catch(() => setError("Falha ao carregar a competência.")); }, [reload]);
  useEffect(() => {
    Promise.all([
      fetch("/api/administrative-entities?q=").then((r) => r.json()),
      fetch("/api/collaborators?status=active&limit=1000").then((r) => r.json()), fetch("/api/master-data/companies").then((r) => r.json()),
      fetch("/api/accounts-payable/transit-voucher/employee-config").then((r) => r.json()),
    ]).then(([entitiesBody, people, companyBody, configBody]) => {
      setEntities((entitiesBody.items ?? []).filter((entity: Entity) => acceptsMA(entity.locality)));
      setCollaborators(people.items ?? []); setCompanies((companyBody.items ?? []).filter((company: Company) => company.active));
      setConfigs(Object.fromEntries((configBody.items ?? []).map((item: { employeeId: string; dailyPassageQuantity: number; defaultCompanyId: string | null }) => [item.employeeId, { qty: item.dailyPassageQuantity, companyId: item.defaultCompanyId }])));
    }).catch(() => undefined);
  }, []);

  const holidayByDate = useMemo(() => new Map((ctx?.holidays ?? []).map((holiday) => [holiday.date, holiday])), [ctx]);
  const companyByText = useCallback((text: string) => companies.find((company) => normalize(companyLabel(company)) === normalize(text) || normalize(company.legalName) === normalize(text)), [companies]);
  const fareDirty = Boolean(ctx) && fareInput.trim().replace(",", ".") !== Number(ctx?.fareUnitPrice).toFixed(2);

  async function post(url: string, method: string, payload: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Falha na operação."); return body;
  }
  async function saveFare() {
    try { setCtx(await post("/api/accounts-payable/transit-voucher/context", "PUT", { year, month, fareUnitPrice: fareInput })); toast.success("Valor da passagem salvo para esta competência."); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao salvar o valor.", "Valor da passagem"); }
  }
  async function saveHoliday(name: string) { try { setCtx(await post("/api/accounts-payable/transit-voucher/holidays", "POST", { year, month, date: holidayDate, name })); setHolidayDate(null); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao salvar o feriado."); } }
  async function removeHoliday() { try { setCtx(await post("/api/accounts-payable/transit-voucher/holidays", "DELETE", { year, month, date: holidayDate })); setHolidayDate(null); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao remover o feriado."); } }

  function changeSelection(ids: string[]) {
    setSelectedIds(ids);
    setValues((current) => { const next = { ...current }; for (const id of ids) if (!next[id]) { const preset = companies.find((company) => company.id === configs[id]?.companyId); next[id] = { companyText: preset ? companyLabel(preset) : "", companyId: preset?.id ?? "", qty: configs[id] ? String(configs[id].qty) : "", diff: "0", discount: "0", obsType: "", obsDetails: "" }; } return next; });
  }
  const patchValue = (id: string, patch: Partial<EntryValue>) => setValues((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  function applyCompany(text: string) { setBulkCompany(text); const company = companyByText(text); if (company) setValues((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, selectedIds.includes(id) ? { ...value, companyText: companyLabel(company), companyId: company.id } : value]))); }

  const entityBase = useMemo(() => mapBase(maps.find((map) => map.administrativeEntity.id === entityId)), [maps, entityId]);
  const baseFare = entityBase?.fareUnitPrice ?? ctx?.fareUnitPrice;
  const baseDays = entityBase?.workingDays ?? ctx?.workingDays ?? 0;
  const fareCents = useMemo(() => { try { return baseFare ? parseFareToCents(baseFare) : 0; } catch { return 0; } }, [baseFare]);
  const preview = selectedIds.map((id) => {
    const value = values[id]; const employee = collaborators.find((item) => item.id === id);
    if (!value || !ctx) return { id, employee, error: "Carregando…", passages: 0, total: 0 };
    const problems: string[] = [];
    if (!value.companyId) problems.push("Empresa");
    if (!isInt(value.qty) || Number(value.qty) < 1) problems.push("Passagem por dia");
    if (!isInt(value.diff)) problems.push("Diferença");
    if (!isInt(value.discount) || Number(value.discount) < 0) problems.push("Descontos");
    if (value.obsType === "OTHER" && !value.obsDetails.trim()) problems.push("Observação");
    if (problems.length) return { id, employee, error: `Revise: ${problems.join(", ")}`, passages: 0, total: 0 };
    const passages = calculatePassagesToReceive(baseDays, Number(value.diff), Number(value.discount));
    try { assertPassagesToReceive(passages); return { id, employee, error: null, passages, total: calculateTransitVoucherEmployeeTotal(fareCents, Number(value.qty), passages) }; }
    catch { return { id, employee, error: "Passagens a receber negativo", passages, total: 0 }; }
  });
  const previewTotal = preview.reduce((sum, row) => sum + row.total, 0);
  const canSave = Boolean(entityId && selectedIds.length && ctx && !fareDirty && preview.every((row) => !row.error && row.total > 0));
  const hint = !entityId ? "Selecione o Cadastro da obrigação." : fareDirty ? "Salve o valor da passagem antes de continuar." : !selectedIds.length ? "Selecione ao menos um colaborador." : preview.find((row) => row.error)?.error ?? null;

  async function save(event: FormEvent) {
    event.preventDefault(); if (!canSave) return; setBusy(true); setError(null);
    try {
      const entries = selectedIds.map((id) => { const value = values[id]; return { employeeId: id, companyId: value.companyId, dailyPassageQuantity: Number(value.qty), previousPassageDifference: Number(value.diff), passageDiscount: Number(value.discount), observationType: value.obsType || null, observationDetails: value.obsDetails.trim() || null }; });
      const body = await post("/api/accounts-payable/transit-voucher/entries", "POST", { year, month, administrativeEntityId: entityId, entries });
      setConfigs((current) => ({ ...current, ...Object.fromEntries(entries.map((entry) => [entry.employeeId, { qty: entry.dailyPassageQuantity, companyId: entry.companyId }])) }));
      setSelectedIds([]); setValues({});
      toast.success(body.duplicateCount ? `${body.createdCount} lançamento(s) salvo(s). ${body.duplicateCount} já lançado(s) nesta competência: ${body.duplicateNames.join(", ")}.` : `${body.createdCount} lançamento(s) de Vale Transporte salvo(s). Rateio gerado.`);
      await reload(); setTab("rateio");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Falha ao salvar lançamentos."; setError(message); toast.error(message, "Não foi possível salvar"); } finally { setBusy(false); }
  }
  async function confirmDelete(reason: string) {
    if (!deleteTarget) return; setDeleting(true); setDeleteError(null);
    try {
      const url = deleteTarget.ids === "map" ? `/api/accounts-payable/transit-voucher/${deleteTarget.mapId}` : `/api/accounts-payable/transit-voucher/${deleteTarget.mapId}/records`;
      await post(url, "DELETE", deleteTarget.ids === "map" ? { reason, confirmation: "EXCLUIR" } : { ids: deleteTarget.ids, reason });
      setDeleteTarget(null); await reload();
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Não foi possível excluir."); } finally { setDeleting(false); }
  }

  // ---- Agregações de leitura (Empresa → Departamento → Colaborador); nada persistido/duplicado ----
  const all = maps.flatMap((map) => map.allocations);
  const tree = useMemo(() => {
    const companiesMap = new Map<string, Map<string, Allocation[]>>();
    for (const row of all) { const departments = companiesMap.get(row.company) ?? new Map<string, Allocation[]>(); const key = row.department ?? "Não informado"; departments.set(key, [...(departments.get(key) ?? []), row]); companiesMap.set(row.company, departments); }
    return companiesMap;
  }, [all]);
  const sum = (rows: Allocation[]) => rows.reduce((total, row) => total + cents(row.amount), 0);
  const grand = sum(all);
  const byCompanySum = [...tree.values()].reduce((total, departments) => total + [...departments.values()].reduce((inner, rows) => inner + sum(rows), 0), 0);
  const mapsTotal = maps.reduce((total, map) => total + cents(map.totalAmount), 0);
  const difference = grand - byCompanySum + (grand - mapsTotal);
  const uniquePeople = new Set(all.map((row) => row.employeeId ?? normalize(row.employeeName))).size;
  const summaryGroups: TransitSummaryGroup[] = [...tree].sort(([a], [b]) => comparePtBr(a, b)).map(([company, departments]) => ({
    company, totalCents: sum([...departments.values()].flat()),
    departments: [...departments].sort(([a], [b]) => comparePtBr(a, b)).map(([department, rows]) => ({ department, records: rows.length, totalCents: sum(rows) })),
  }));
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  const severalDays = [...new Set(maps.map((map) => mapBase(map)?.workingDays))].length > 1;
  const severalFares = [...new Set(maps.map((map) => mapBase(map)?.fareUnitPrice))].length > 1;

  return <div className="flex flex-1 flex-col">
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
      <PageHeader backHref="/pagamentos" backLabel="Despesas" title="Vale Transporte" description="Rateio por Empresa → Departamento → Colaborador · Maranhão (MA)." />
      <Tabs label="Etapas do Vale Transporte" items={STAGES} value={tab} onValueChange={(value) => setTab(value as typeof tab)} variant="segmented">
        <TabPanel value="preenchimento" className="mt-4">
          <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <Card padding="none">
              <div className="grid gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <CardHeader titleAs="h2" title="Competência, calendário e tarifa" description="Dias úteis = segunda a sexta menos os feriados em dias úteis." />
                  <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[12rem_16rem]">
                    <Field label="Competência" required>{(control) => <input {...control} type="month" className={textInputClassName} value={competence} onChange={(event) => setCompetence(event.target.value)} />}</Field>
                    <Field label="Cadastro da obrigação" required>{(control) => <select {...control} required className={textInputClassName} value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select>}</Field>
                  </div>
                </div>
                <CompetenceSummary items={[
                  { label: "Competência", value: monthLabel },
                  { label: "Dias úteis", value: String(ctx?.workingDays ?? "—"), helper: ctx ? `${ctx.weekdays} seg–sex − ${ctx.holidaysOnWeekdays} feriado(s)` : undefined },
                  { label: "Feriados", value: String(ctx?.holidaysInMonth ?? "—"), helper: "No mês" },
                  { label: "Tarifa", value: baseFare ? money(baseFare) : "—", helper: entityBase ? "Base histórica do mapa" : ctx?.fareDefined ? "Salva na competência" : "Padrão (não salva)" },
                  { label: "Colaboradores", value: selectedIds.length, helper: "Selecionados" },
                  { label: "Prévia do total", value: moneyCents(previewTotal), helper: "Recalculado ao salvar", emphasis: true },
                ]} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-5 border-t border-border p-4 sm:p-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2">
                  <CompetenceCalendar year={year} month={month} holidays={ctx?.holidays ?? []} onSelect={setHolidayDate} />
                  <p className="text-caption text-foreground-muted">Feriados nacionais são automáticos. Clique em uma data para cadastrar feriados estaduais, municipais ou internos (ou para editar/remover os manuais).</p>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
                  <div>
                    <h3 className="mb-2 text-label text-foreground-muted">Feriados cadastrados{ctx ? ` (${ctx.holidays.length})` : ""}</h3>
                    {ctx?.holidays.length ? (
                      <ul className="grid gap-1">
                        {ctx.holidays.map((holiday) => (
                          <li key={holiday.date}>
                            <button type="button" className="flex w-full cursor-pointer items-start gap-2 rounded-control px-1.5 py-1 text-left text-body hover:bg-surface-muted" onClick={() => setHolidayDate(holiday.date)}>
                              <CalendarDays size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-success-text" />
                              <span className="min-w-0"><strong className="tabular-nums">{dayMonth(holiday.date)}</strong> — {holiday.name}<span className="block text-caption text-foreground-muted">{holiday.source === "NATIONAL" ? "Nacional" : "Manual"}</span></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-body text-foreground-muted">Nenhum feriado marcado.</p>}
                  </div>
                  <div className="grid gap-2 rounded-control border border-border p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Valor unitário da passagem (R$)" className="min-w-40 flex-1">{(control) => <CurrencyInput {...control} value={fareValue(fareInput)} onValueChange={(value) => setFareInput(fareText(value))} />}</Field>
                      <Button variant="secondary" onClick={saveFare} disabled={!fareDirty}>Salvar valor</Button>
                    </div>
                    <p className="text-caption text-foreground-muted">{ctx?.fareDefined ? "Valor salvo nesta competência; lançamentos antigos não mudam se ele for alterado." : "Valor padrão R$ 4,20 (ainda não salvo para esta competência)."}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="grid gap-4">
              <CardHeader titleAs="h2" title="Colaboradores" description="Empresa e passagens por dia começam com o padrão de cada colaborador e continuam editáveis por linha." />
              {entityBase && <FeedbackAlert status="info">Este lançamento já possui mapa: novos colaboradores usarão a base histórica do mapa ({entityBase.workingDays} dias úteis · {money(entityBase.fareUnitPrice)} por passagem), mesmo que a competência tenha sido alterada depois.</FeedbackAlert>}
              <CollaboratorMultiCombobox value={selectedIds} options={collaborators} onChange={changeSelection} />
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-end gap-3 rounded-control border border-border bg-surface-muted p-3" role="group" aria-label="Aplicar a todos os selecionados">
                  <datalist id="vt-companies">{companies.map((company) => <option key={company.id} value={companyLabel(company)} />)}</datalist>
                  <Field label="Empresa para todos os selecionados" className="min-w-56 flex-1">{(control) => <input {...control} list="vt-companies" className={textInputClassName} value={bulkCompany} onChange={(event) => applyCompany(event.target.value)} placeholder="Digite para buscar" />}</Field>
                  <Button variant="secondary" onClick={() => setCompanyModal(true)}>Cadastrar empresa</Button>
                </div>
              )}
            </Card>

            {selectedIds.length > 0 && (
              <TransitFillTable
                rows={preview}
                values={values}
                baseDays={baseDays}
                fare={baseFare}
                companyListId="vt-companies"
                previewTotal={previewTotal}
                onPatch={patchValue}
                onCompanyText={(id, text) => { const company = companyByText(text); patchValue(id, { companyText: text, companyId: company?.id ?? "" }); }}
              />
            )}

            <Card className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <CalculatedValue label="Prévia do Total Geral" value={moneyCents(previewTotal)} helper={`${people(selectedIds.length)} · recalculado pelo servidor ao salvar`} size="lg" live />
              <div className="grid gap-1.5 md:justify-items-end">
                <Button type="submit" disabled={busy || !canSave} loading={busy} aura={canSave} className="w-full md:w-auto md:min-w-56">Salvar / Gerar Rateio</Button>
                {hint && <p className="text-caption text-foreground-muted">{hint}</p>}
              </div>
              {error && <FeedbackAlert status="error" className="md:col-span-2">{error}</FeedbackAlert>}
            </Card>
          </form>
        </TabPanel>

        <TabPanel value="rateio" className="mt-4">
          <TransitAllocationView maps={maps} monthLabel={monthLabel} baseOf={(map) => mapBase(map) ?? { workingDays: ctx?.workingDays ?? null, fareUnitPrice: ctx?.fareUnitPrice ?? null }} onCorrect={(mapId, row) => setCorrecting({ mapId, row })} onDeleteRecord={(mapId, rowId) => setDeleteTarget({ mapId, ids: [rowId] })} onCancel={(mapId) => setDeleteTarget({ mapId, ids: "map" })} />
        </TabPanel>

        <TabPanel value="resumo" className="mt-4">
          <TransitSummaryView groups={summaryGroups} grandCents={grand} difference={difference} indicators={[
            { label: "Empresas", value: tree.size },
            { label: "Colaboradores", value: uniquePeople },
            { label: "Dias úteis", value: severalDays ? "Vários" : String(mapBase(maps[0])?.workingDays ?? ctx?.workingDays ?? "—") },
            { label: "Passagem", value: severalFares ? "Vários" : mapBase(maps[0]) ? money(mapBase(maps[0])!.fareUnitPrice) : ctx ? money(ctx.fareUnitPrice) : "—" },
            { label: "Total Geral", value: moneyCents(grand), emphasis: true },
          ]} />
        </TabPanel>
      </Tabs>
    </main>
    <HolidayModal date={holidayDate} holiday={holidayDate ? holidayByDate.get(holidayDate) ?? null : null} onClose={() => setHolidayDate(null)} onSave={saveHoliday} onRemove={removeHoliday} />
    <CorrectionModal target={correcting} companies={companies} onClose={() => setCorrecting(null)} onSaved={reload} />
    <CompanyModal open={companyModal} onClose={() => setCompanyModal(false)} onCreated={(company) => setCompanies((current) => [...current, company])} />
    <DeletionModal open={deleteTarget !== null} title={deleteTarget?.ids === "map" ? "Cancelar todo o lançamento?" : "Excluir registro?"} description={deleteTarget?.ids === "map" ? "O lançamento e a obrigação serão cancelados." : "Essa ação cancelará o registro e recalculará departamento, empresa, total e obrigação."} count={deleteTarget?.ids === "map" ? 1 : (deleteTarget?.ids.length ?? 1)} requireKeyword={deleteTarget?.ids === "map"} busy={deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={confirmDelete} />
    {deleteError && <div className="mx-auto w-full max-w-7xl px-4 sm:px-6"><FeedbackAlert status="error">{deleteError}</FeedbackAlert></div>}
  </div>;
}
