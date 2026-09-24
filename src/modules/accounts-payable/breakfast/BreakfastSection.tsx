"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence/target changes load a persisted server snapshot */
// Subseção "Café da Manhã" de Despesas → Alimentação. Reaproveita a experiência já aprovada do
// Vale Transporte (calendário/feriados, seleção de empresa/colaboradores, snapshots, correção,
// rateio, resumo, XLSX) via os componentes compartilhados em @/components/allocation e as
// funções puras de calendário/feriados em @/modules/shared — mas com domínio de dados próprio
// (BreakfastCompetence/Map/Allocation), sem nenhuma relação com TransitVoucher*.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AllocationCard, AllocationDepartmentAccordion, AllocationDepartmentList } from "@/components/allocation/AllocationCard";
import { CompetenceCalendar, HolidayModal, type Holiday } from "@/components/allocation/CompetenceHolidays";
import { CompanyModal, companyLabel, normalizeText as normalize, type Company } from "@/components/allocation/CompanyPicker";
import { Badge, Button, DeletionModal, EmptyState, MetricCard, buttonClassName, useToast } from "@/components/ui";
import { type CollaboratorOption } from "@/components/CollaboratorCombobox";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { ManualEntrySection } from "@/components/ManualEntryLayout";
import { BREAKFAST_ALLOWED_DEPARTMENT, calculateBreakfastEmployeeTotal, calculateFinalQuantity, formatBreakfastObservation, parseUnitPriceToCents, type BreakfastObservationKind } from "./calculations";
import { comparePtBr } from "@/lib/sorting/ptBr";

type Entity = { id: string; cnpj: string | null; tradeName: string; legalName: string; activityArea: string; locality: string };
type Context = { year: number; month: number; unitPrice: string; unitPriceDefined: boolean; holidays: Holiday[]; weekdays: number; holidaysInMonth: number; holidaysOnWeekdays: number; workingDays: number };
type Allocation = {
  id: string; employeeId: string | null; company: string; employeeName: string; department: string | null; costCenter: string | null;
  amount: string; workingDays: number | null; baseQuantity: number | null; extraQuantity: number | null; discountQuantity: number; finalQuantity: number | null; unitPrice: string | null;
  observationType: BreakfastObservationKind | null; observationDetails: string | null;
};
type MapData = { id: string; version: number; totalAmount: string; administrativeEntity: Entity; financialRecord: { identifier: string } | null; allocations: Allocation[] };
type EntryValue = { companyText: string; companyId: string; extra: string; discount: string; obsType: "" | BreakfastObservationKind; obsDetails: string };

const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const cents = (value: string | number) => Math.round(Number(value) * 100);
// O mapa é a fonte histórica: valor unitário e dias úteis vêm dos registros do próprio mapa, nunca da competência atual.
const mapBase = (map: MapData | undefined) => { const row = map?.allocations.find((item) => item.workingDays !== null && item.unitPrice !== null); return row ? { workingDays: row.workingDays as number, unitPrice: Number(row.unitPrice).toFixed(2) } : null; };
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const people = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;
const isInt = (value: string) => /^-?\d+$/.test(value.trim());
// Cadastros compatíveis com Alimentação ou Café da Manhã (nunca nome de fornecedor fixo no componente).
const matchesActivity = (activityArea: string) => { const value = normalize(activityArea); return value.includes("alimenta") || value.includes("cafe"); };

function CorrectionModal({ target, companies, onClose, onSaved }: { target: { mapId: string; row: Allocation } | null; companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ companyText: "", extra: "0", discount: "0", obsType: "" as "" | BreakfastObservationKind, obsDetails: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current; if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
    if (target) { const row = target.row; setError(null); setForm({ companyText: row.company, extra: String(row.extraQuantity ?? 0), discount: String(row.discountQuantity ?? 0), obsType: row.observationType ?? "", obsDetails: row.observationDetails ?? "", reason: "" }); }
  }, [target]);
  const company = companies.find((item) => normalize(companyLabel(item)) === normalize(form.companyText) || normalize(item.legalName) === normalize(form.companyText));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!target?.row.employeeId) return;
    if (!company) return setError("Selecione uma empresa cadastrada.");
    if (!isInt(form.extra) || Number(form.extra) < 0) return setError("Quantidade extras deve ser um número inteiro não negativo.");
    if (!isInt(form.discount) || Number(form.discount) < 0) return setError("Desconto deve ser um número inteiro não negativo.");
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/accounts-payable/breakfast/${target.mapId}/entries/${target.row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: form.reason, entry: { employeeId: target.row.employeeId, companyId: company.id, extraQuantity: Number(form.extra), discountQuantity: Number(form.discount), observationType: form.obsType || null, observationDetails: form.obsDetails.trim() || null } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Falha ao corrigir.");
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao corrigir."); } finally { setBusy(false); }
  }
  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <form onSubmit={submit} className="modal-box max-w-lg border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">Corrigir lançamento</h2>
        <p className="mt-1 text-sm text-secondary">{target?.row.employeeName} · o registro atual é cancelado (com histórico) e um novo é gerado, preservando a base histórica do lançamento; só os campos que você alterar mudam o resultado.</p>
        {target && <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-base-300 bg-base-200/60 p-3 text-xs sm:grid-cols-4" aria-label="Base histórica preservada"><div><dt className="text-secondary">Valor unitário</dt><dd className="font-semibold">{target.row.unitPrice ? money(target.row.unitPrice) : "—"}</dd></div><div><dt className="text-secondary">Dias úteis / Quantidade</dt><dd className="font-semibold">{target.row.workingDays ?? "—"}</dd></div><div><dt className="text-secondary">Departamento</dt><dd className="font-semibold">{target.row.department ?? "—"}</dd></div><div><dt className="text-secondary">Centro de custo</dt><dd className="font-semibold">{target.row.costCenter ?? "—"}</dd></div></dl>}
        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="form-control sm:col-span-2"><span className="label-text mb-1">Empresa</span><input list="cafe-companies-correction" className="input input-bordered w-full" value={form.companyText} onChange={(event) => setForm({ ...form, companyText: event.target.value })} /><datalist id="cafe-companies-correction">{companies.map((item) => <option key={item.id} value={companyLabel(item)} />)}</datalist></label>
          <label className="form-control"><span className="label-text mb-1">Desconto</span><input inputMode="numeric" className="input input-bordered w-full text-center" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></label>
          <label className="form-control"><span className="label-text mb-1">Quantidade extras</span><input inputMode="numeric" className="input input-bordered w-full text-center" value={form.extra} onChange={(event) => setForm({ ...form, extra: event.target.value })} /></label>
          <label className="form-control"><span className="label-text mb-1">Observação</span><select className="select select-bordered w-full" value={form.obsType} onChange={(event) => setForm({ ...form, obsType: event.target.value as "" | BreakfastObservationKind })}><option value="">—</option><option value="RETROACTIVE">Retroativo</option><option value="OTHER">Outros</option></select></label>
          {form.obsType && <label className="form-control sm:col-span-2"><span className="label-text mb-1">Detalhes</span><input className="input input-bordered w-full" value={form.obsDetails} onChange={(event) => setForm({ ...form, obsDetails: event.target.value })} /></label>}
          <label className="form-control sm:col-span-2"><span className="label-text mb-1">Motivo da correção *</span><input required className="input input-bordered w-full" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        </div>
        <div className="modal-action"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" loading={busy} disabled={busy || !form.reason.trim()}>Salvar correção</Button></div>
      </form>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar">Fechar</button></form>
    </dialog>
  );
}

export function BreakfastSection() {
  const toast = useToast();
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = competence.split("-").map(Number);
  const [tab, setTab] = useState<"preenchimento" | "rateio" | "resumo">("preenchimento");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const topogeoCollaborators = useMemo(() => collaborators.filter((item) => normalize(item.department) === normalize(BREAKFAST_ALLOWED_DEPARTMENT)), [collaborators]);
  const [configs, setConfigs] = useState<Record<string, { companyId: string | null }>>({});
  const [ctx, setCtx] = useState<Context | null>(null);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [entityId, setEntityId] = useState("");
  const [priceInput, setPriceInput] = useState("12.50");
  const [holidayDate, setHolidayDate] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, EntryValue>>({});
  const [bulkCompany, setBulkCompany] = useState("");
  const [companyModal, setCompanyModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ mapId: string } | null>(null);
  const [correcting, setCorrecting] = useState<{ mapId: string; row: Allocation } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    const response = await fetch(`/api/accounts-payable/breakfast/context?year=${year}&month=${month}`); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setCtx(body); setPriceInput(body.unitPrice);
  }, [year, month]);
  const loadMaps = useCallback(async () => {
    const response = await fetch(`/api/accounts-payable/breakfast?year=${year}&month=${month}`); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setMaps(body.competence?.maps ?? []);
  }, [year, month]);
  const reload = useCallback(async () => { await Promise.all([loadContext(), loadMaps()]); }, [loadContext, loadMaps]);
  useEffect(() => { reload().catch(() => setError("Falha ao carregar a competência.")); }, [reload]);
  useEffect(() => {
    Promise.all([
      fetch("/api/administrative-entities?q=").then((r) => r.json()),
      fetch("/api/collaborators?status=active&limit=1000").then((r) => r.json()), fetch("/api/master-data/companies").then((r) => r.json()),
      fetch("/api/accounts-payable/breakfast/employee-config").then((r) => r.json()),
    ]).then(([entitiesBody, peopleBody, companyBody, configBody]) => {
      setEntities((entitiesBody.items ?? []).filter((entity: Entity) => matchesActivity(entity.activityArea)));
      setCollaborators(peopleBody.items ?? []); setCompanies((companyBody.items ?? []).filter((company: Company) => company.active));
      setConfigs(Object.fromEntries((configBody.items ?? []).map((item: { employeeId: string; defaultCompanyId: string | null }) => [item.employeeId, { companyId: item.defaultCompanyId }])));
    }).catch(() => undefined);
  }, []);

  const holidayByDate = useMemo(() => new Map((ctx?.holidays ?? []).map((holiday) => [holiday.date, holiday])), [ctx]);
  const companyByText = useCallback((text: string) => companies.find((company) => normalize(companyLabel(company)) === normalize(text) || normalize(company.legalName) === normalize(text)), [companies]);
  const priceDirty = Boolean(ctx) && priceInput.trim().replace(",", ".") !== Number(ctx?.unitPrice).toFixed(2);

  async function post(url: string, method: string, payload: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Falha na operação."); return body;
  }
  async function savePrice() {
    try { setCtx(await post("/api/accounts-payable/breakfast/context", "PUT", { year, month, unitPrice: priceInput })); toast.success("Valor do café da manhã salvo para esta competência."); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao salvar o valor.", "Valor do café da manhã"); }
  }
  async function saveHoliday(name: string) { try { setCtx(await post("/api/accounts-payable/breakfast/holidays", "POST", { year, month, date: holidayDate, name })); setHolidayDate(null); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao salvar o feriado."); } }
  async function removeHoliday() { try { setCtx(await post("/api/accounts-payable/breakfast/holidays", "DELETE", { year, month, date: holidayDate })); setHolidayDate(null); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao remover o feriado."); } }

  function changeSelection(ids: string[]) {
    setSelectedIds(ids);
    setValues((current) => { const next = { ...current }; for (const id of ids) if (!next[id]) { const preset = companies.find((company) => company.id === configs[id]?.companyId); next[id] = { companyText: preset ? companyLabel(preset) : "", companyId: preset?.id ?? "", extra: "0", discount: "0", obsType: "", obsDetails: "" }; } return next; });
  }
  const patchValue = (id: string, patch: Partial<EntryValue>) => setValues((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  function applyCompany(text: string) { setBulkCompany(text); const company = companyByText(text); if (company) setValues((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, selectedIds.includes(id) ? { ...value, companyText: companyLabel(company), companyId: company.id } : value]))); }

  const entityBase = useMemo(() => mapBase(maps.find((map) => map.administrativeEntity.id === entityId)), [maps, entityId]);
  const basePrice = entityBase?.unitPrice ?? ctx?.unitPrice;
  const baseDays = entityBase?.workingDays ?? ctx?.workingDays ?? 0;
  const priceCents = useMemo(() => { try { return basePrice ? parseUnitPriceToCents(basePrice) : 0; } catch { return 0; } }, [basePrice]);
  const preview = selectedIds.map((id) => {
    const value = values[id]; const employee = collaborators.find((item) => item.id === id);
    if (!value || !ctx) return { id, employee, error: "Carregando…", finalQuantity: 0, total: 0 };
    const problems: string[] = [];
    if (!value.companyId) problems.push("Empresa");
    if (!isInt(value.extra) || Number(value.extra) < 0) problems.push("Quantidade extras");
    if (!isInt(value.discount) || Number(value.discount) < 0) problems.push("Desconto");
    if (value.obsType === "OTHER" && !value.obsDetails.trim()) problems.push("Observação");
    if (problems.length) return { id, employee, error: `Revise: ${problems.join(", ")}`, finalQuantity: 0, total: 0 };
    try { const finalQuantity = calculateFinalQuantity(baseDays, Number(value.extra), Number(value.discount)); return { id, employee, error: null, finalQuantity, total: calculateBreakfastEmployeeTotal(priceCents, finalQuantity) }; }
    catch (cause) { return { id, employee, error: cause instanceof Error ? cause.message : "Quantidade inválida", finalQuantity: 0, total: 0 }; }
  });
  const previewTotal = preview.reduce((sum, row) => sum + row.total, 0);
  const canSave = Boolean(entityId && selectedIds.length && ctx && !priceDirty && preview.every((row) => !row.error && row.total > 0));
  const hint = !entityId ? "Selecione o Cadastro da obrigação." : priceDirty ? "Salve o valor do café da manhã antes de continuar." : !selectedIds.length ? "Selecione ao menos um colaborador." : preview.find((row) => row.error)?.error ?? null;

  async function save(event: FormEvent) {
    event.preventDefault(); if (!canSave) return; setBusy(true); setError(null);
    try {
      const entries = selectedIds.map((id) => { const value = values[id]; return { employeeId: id, companyId: value.companyId, extraQuantity: Number(value.extra), discountQuantity: Number(value.discount), observationType: value.obsType || null, observationDetails: value.obsDetails.trim() || null }; });
      const body = await post("/api/accounts-payable/breakfast/entries", "POST", { year, month, administrativeEntityId: entityId, entries });
      setConfigs((current) => ({ ...current, ...Object.fromEntries(entries.map((entry) => [entry.employeeId, { companyId: entry.companyId }])) }));
      setSelectedIds([]); setValues({});
      toast.success(body.duplicateCount ? `${body.createdCount} lançamento(s) salvo(s). ${body.duplicateCount} já lançado(s) nesta competência: ${body.duplicateNames.join(", ")}.` : `${body.createdCount} lançamento(s) de Café da Manhã salvo(s). Rateio gerado.`);
      await reload(); setTab("rateio");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Falha ao salvar lançamentos."; setError(message); toast.error(message, "Não foi possível salvar"); } finally { setBusy(false); }
  }
  async function confirmDelete(reason: string) {
    if (!deleteTarget) return; setDeleting(true); setDeleteError(null);
    try { await post(`/api/accounts-payable/breakfast/${deleteTarget.mapId}`, "DELETE", { reason, confirmation: "EXCLUIR" }); setDeleteTarget(null); await reload(); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Não foi possível excluir."); } finally { setDeleting(false); }
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
  const totalMeals = all.reduce((total, row) => total + (row.finalQuantity ?? 0), 0);
  const sortedTree = [...tree].sort(([a], [b]) => comparePtBr(a, b));

  const tabButton = (id: typeof tab, label: string) => <Button type="button" role="tab" aria-selected={tab === id} variant={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>{label}</Button>;
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;

  return <div className="grid gap-6">
    <div className="rounded-lg border border-base-300 bg-base-100 p-1"><div role="tablist" aria-label="Etapas do Café da Manhã" className="grid grid-cols-3 gap-1">{tabButton("preenchimento", "Preenchimento")}{tabButton("rateio", "Rateio")}{tabButton("resumo", "Resumo")}</div></div>

    {tab === "preenchimento" && <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-5" role="tabpanel">
      <ManualEntrySection eyebrow="1. Dados necessários" title="Competência, calendário e valor">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="form-control"><span className="label-text mb-1">Competência *</span><input type="month" className="input input-bordered w-full" value={competence} onChange={(event) => setCompetence(event.target.value)} /></label>
          <label className="form-control"><span className="label-text mb-1">Cadastro da obrigação *</span><select required className="select select-bordered w-full" value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select></label>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div><CompetenceCalendar year={year} month={month} holidays={ctx?.holidays ?? []} onSelect={setHolidayDate} /><p className="mt-2 text-xs text-secondary">Feriados nacionais são automáticos. Clique em uma data para cadastrar feriados estaduais, municipais ou internos (ou para editar/remover os manuais).</p></div>
          <div className="grid content-start gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><MetricCard label="Competência" value={monthLabel} /></div>
              <MetricCard label="Dias úteis" value={String(ctx?.workingDays ?? "—")} description={ctx ? `${ctx.weekdays} seg–sex − ${ctx.holidaysOnWeekdays} feriado(s)` : undefined} accent />
              <MetricCard label="Feriados" value={String(ctx?.holidaysInMonth ?? "—")} />
            </div>
            <div className="rounded-lg border border-base-300 p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Feriados cadastrados</span>
              {ctx?.holidays.length ? <ul className="mt-2 grid gap-1 text-sm">{ctx.holidays.map((holiday) => <li key={holiday.date}><button type="button" className="text-left hover:text-primary" onClick={() => setHolidayDate(holiday.date)}><strong>{dayMonth(holiday.date)}</strong> — {holiday.name}<span className="ml-2 text-xs text-secondary">{holiday.source === "NATIONAL" ? "Nacional" : "Manual"}</span></button></li>)}</ul> : <p className="mt-1 text-sm text-secondary">Nenhum feriado marcado.</p>}
            </div>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-base-300 p-3">
              <label className="form-control min-w-40 flex-1"><span className="label-text mb-1">Valor unitário do café da manhã</span><input inputMode="decimal" className="input input-bordered w-full" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} /></label>
              <Button type="button" variant="secondary" onClick={savePrice} disabled={!priceDirty}>Salvar valor</Button>
              <span className="basis-full text-xs text-secondary">{ctx?.unitPriceDefined ? "Valor salvo nesta competência; lançamentos antigos não mudam se ele for alterado." : "Valor padrão R$ 12,50 (ainda não salvo para esta competência)."}</span>
            </div>
          </div>
        </div>
      </ManualEntrySection>

      <ManualEntrySection eyebrow="2. Pessoas" title="Colaboradores">
        {entityBase && <p className="mb-3 rounded-lg border border-base-300 bg-base-100 p-3 text-sm text-secondary" role="note">Este lançamento já possui mapa: novos colaboradores usarão a base histórica do mapa ({entityBase.workingDays} dias úteis · {money(entityBase.unitPrice)} por café), mesmo que a competência tenha sido alterada depois.</p>}
        <CollaboratorMultiCombobox value={selectedIds} options={topogeoCollaborators} onChange={changeSelection} fixedDepartment={BREAKFAST_ALLOWED_DEPARTMENT} />
        {selectedIds.length > 0 && <>
          <datalist id="cafe-companies">{companies.map((company) => <option key={company.id} value={companyLabel(company)} />)}</datalist>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="form-control min-w-56 flex-1"><span className="label-text mb-1">Empresa para todos os selecionados</span><input list="cafe-companies" className="input input-bordered w-full" value={bulkCompany} onChange={(event) => applyCompany(event.target.value)} placeholder="Digite para buscar" /></label>
            <Button type="button" variant="secondary" onClick={() => setCompanyModal(true)}>Cadastrar empresa</Button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-base-300">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className="border-b border-border bg-base-200 text-left text-xs">
                <th className="p-2">Empresa</th>
                <th className="p-2">Colaborador</th>
                <th className="p-2">Departamento</th>
                <th className="w-16 p-2 text-center">Quantidade</th>
                <th className="w-16 p-2 text-center">Desconto</th>
                <th className="w-20 p-2 text-center"><span className="block">Quantidade</span><span className="block">Extras</span></th>
                <th className="w-20 p-2 text-center"><span className="block">Quantidade</span><span className="block">Final</span></th>
                <th className="w-28 p-2 text-right">Valor Total</th>
                <th className="p-2">Observação</th>
              </tr></thead>
              <tbody>
                {preview.map((row) => { const value = values[row.id]; if (!value) return null; const unmatched = value.companyText.trim() && !value.companyId; return <tr key={row.id} className="border-b border-border align-top last:border-0">
                  <td className="p-2"><input list="cafe-companies" aria-label={`Empresa de ${row.employee?.officialName}`} className={`input input-bordered input-sm w-40 ${unmatched || !value.companyId ? "input-warning" : ""}`} value={value.companyText} onChange={(event) => { const company = companyByText(event.target.value); patchValue(row.id, { companyText: event.target.value, companyId: company?.id ?? "" }); }} />{unmatched && <span className="mt-1 block text-xs text-warning">Selecione uma empresa cadastrada.</span>}</td>
                  <td className="p-2 font-medium">{row.employee?.officialName}</td>
                  <td className="p-2">{row.employee?.department}<span className="block text-xs text-secondary">{row.employee?.costCenter || "Sem CC"}</span></td>
                  <td className="w-16 p-2 text-center"><span className="badge badge-ghost">{baseDays}</span></td>
                  <td className="w-16 p-2 text-center"><input aria-label="Desconto" inputMode="numeric" className="input input-bordered input-sm w-16 text-center" value={value.discount} onChange={(event) => patchValue(row.id, { discount: event.target.value })} /></td>
                  <td className="w-20 p-2 text-center"><input aria-label="Quantidade extras" inputMode="numeric" className="input input-bordered input-sm w-16 text-center" value={value.extra} onChange={(event) => patchValue(row.id, { extra: event.target.value })} /></td>
                  <td className={`w-20 p-2 text-center font-semibold ${row.error ? "text-error" : ""}`}>{row.error ? "—" : row.finalQuantity}</td>
                  <td className="w-28 whitespace-nowrap p-2 text-right font-semibold text-primary">{row.error ? <span className="text-xs font-normal text-error">{row.error}</span> : money(row.total / 100)}</td>
                  <td className="p-2"><div className="flex gap-1"><select aria-label="Tipo de observação" className="select select-bordered select-sm w-24" value={value.obsType} onChange={(event) => patchValue(row.id, { obsType: event.target.value as EntryValue["obsType"] })}><option value="">—</option><option value="RETROACTIVE">Retroativo</option><option value="OTHER">Outros</option></select>{value.obsType && <input aria-label="Detalhes da observação" className="input input-bordered input-sm w-36" placeholder={value.obsType === "RETROACTIVE" ? "2 cafés referentes ao mês anterior" : "Detalhes"} value={value.obsDetails} onChange={(event) => patchValue(row.id, { obsDetails: event.target.value })} />}</div>{value.obsType && value.obsDetails.trim() && <span className="mt-1 block text-xs text-secondary">{formatBreakfastObservation(value.obsType, value.obsDetails)}</span>}</td>
                </tr>; })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">Prévia do Total Geral: <strong className="text-primary">{money(previewTotal / 100)}</strong> · {selectedIds.length} colaborador(es) · o servidor recalcula tudo ao salvar.</p>
        </>}
      </ManualEntrySection>

      {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
      <div className="flex flex-col gap-2 md:items-end"><Button type="submit" disabled={busy || !canSave} loading={busy} aura={canSave} className="w-full md:w-auto md:min-w-64">Salvar / Gerar Rateio</Button>{hint && <p className="text-xs text-secondary">{hint}</p>}</div>
    </form>}

    {tab === "rateio" && <section role="tabpanel" className="grid gap-4">
      {maps.length ? maps.map((map) => {
        const rows = map.allocations; const mapTree = new Map<string, Map<string, Allocation[]>>();
        for (const row of rows) { const departments = mapTree.get(row.company) ?? new Map<string, Allocation[]>(); const key = row.department ?? "Não informado"; departments.set(key, [...(departments.get(key) ?? []), row]); mapTree.set(row.company, departments); }
        const mapSum = sum(rows); const diff = mapSum - cents(map.totalAmount);
        return <AllocationCard key={map.id} title={map.administrativeEntity.tradeName} subtitle={`competência ${String(month).padStart(2, "0")}/${year} · v${map.version}`} badge={<Badge tone="success">Concluído</Badge>}
          indicators={[{ label: "Empresas / setores", value: `${mapTree.size} / ${[...mapTree.values()].reduce((total, departments) => total + departments.size, 0)}` }, { label: "Colaboradores", value: new Set(rows.map((row) => row.employeeId ?? row.employeeName)).size }, { label: "Dias úteis · valor", value: `${mapBase(map)?.workingDays ?? ctx?.workingDays ?? "—"} · ${mapBase(map) ? money(mapBase(map)!.unitPrice) : ctx ? money(ctx.unitPrice) : "—"}` }, { label: "Valor total · obrigação", value: `${money(map.totalAmount)}${map.financialRecord ? ` · ${map.financialRecord.identifier}` : ""}` }]}>
          <AllocationDepartmentList>{[...mapTree].sort(([a], [b]) => comparePtBr(a, b)).map(([company, departments]) => { const companyRows = [...departments.values()].flat(); return <AllocationDepartmentAccordion key={company} name={company} summary={`${people(new Set(companyRows.map((row) => row.employeeId ?? row.employeeName)).size)} · ${money(sum(companyRows) / 100)}`}>
            <div className="grid gap-3">{[...departments].sort(([a], [b]) => comparePtBr(a, b)).map(([department, deptRows]) => <AllocationDepartmentAccordion key={department} name={department} summary={`${people(deptRows.length)} · ${money(sum(deptRows) / 100)}`}>
              <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-secondary"><th className="py-2 pr-2">Colaborador</th><th className="w-16 py-2 pr-2 text-center">Quantidade</th><th className="w-16 py-2 pr-2 text-center">Desconto</th><th className="w-16 py-2 pr-2 text-center">Extras</th><th className="w-16 py-2 pr-2 text-center">Final</th><th className="w-24 py-2 pr-2 text-right">Valor</th><th className="py-2 pr-2">Observação</th><th /></tr></thead><tbody>{[...deptRows].sort((a, b) => comparePtBr(a.employeeName, b.employeeName)).map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="py-2 pr-2">{row.employeeName}</td><td className="py-2 pr-2 text-center">{row.baseQuantity ?? "—"}</td><td className="py-2 pr-2 text-center">{row.discountQuantity}</td><td className="py-2 pr-2 text-center">{row.extraQuantity ?? "—"}</td><td className="py-2 pr-2 text-center">{row.finalQuantity ?? "—"}</td><td className="whitespace-nowrap py-2 pr-2 text-right">{money(row.amount)}</td><td className="py-2 pr-2">{formatBreakfastObservation(row.observationType, row.observationDetails) || "—"}</td><td className="whitespace-nowrap py-2 text-right">{row.finalQuantity !== null && <button type="button" className="text-xs font-semibold text-primary" onClick={() => setCorrecting({ mapId: map.id, row })}>Corrigir</button>}</td></tr>)}</tbody></table></div>
            </AllocationDepartmentAccordion>)}</div>
          </AllocationDepartmentAccordion>; })}</AllocationDepartmentList>
          <div className={`mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md border px-3 py-2 text-sm ${diff !== 0 ? "border-error/40 bg-error/5 text-error" : "border-border"}`} role={diff !== 0 ? "alert" : undefined}><span>Valor total <strong>{money(map.totalAmount)}</strong></span><span>Rateado <strong>{money(mapSum / 100)}</strong></span><span>Diferença <strong>{money(diff / 100)}</strong></span></div>
          <div className="mt-4 flex flex-wrap gap-2"><a href={`/api/accounts-payable/breakfast/${map.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}>Download do rateio XLSX</a><Button size="sm" variant="error" onClick={() => setDeleteTarget({ mapId: map.id })}>Cancelar lançamento</Button></div>
        </AllocationCard>;
      }) : <div className="card"><EmptyState title="Nenhum lançamento nesta competência." description="Preencha as etapas 1 e 2 para gerar o rateio." /></div>}
    </section>}

    {tab === "resumo" && <section role="tabpanel" className="grid gap-4">
      {all.length ? <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Empresas" value={String(tree.size)} /><MetricCard label="Colaboradores" value={String(uniquePeople)} /><MetricCard label="Dias úteis" value={[...new Set(maps.map((map) => mapBase(map)?.workingDays))].length > 1 ? "Vários" : String(mapBase(maps[0])?.workingDays ?? ctx?.workingDays ?? "—")} /><MetricCard label="Quantidade de cafés" value={String(totalMeals)} /><MetricCard label="Valor unitário" value={[...new Set(maps.map((map) => mapBase(map)?.unitPrice))].length > 1 ? "Vários" : mapBase(maps[0]) ? money(mapBase(maps[0])!.unitPrice) : ctx ? money(ctx.unitPrice) : "—"} /><MetricCard label="Total Geral" value={money(grand / 100)} accent /></div>
        <div className="grid gap-3">{sortedTree.map(([company, departments]) => { const companyRows = [...departments.values()].flat(); return <details key={company} open className="rounded-lg border border-border"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><strong>{company}</strong><span className="font-semibold text-primary">{money(sum(companyRows) / 100)}</span></summary><div className="border-t border-border px-4 py-2">{[...departments].sort(([a], [b]) => comparePtBr(a, b)).map(([department, rows]) => <div key={department} className="flex justify-between border-b border-border py-2 pl-4 text-sm last:border-0"><span>↳ {department} <span className="text-xs text-secondary">({rows.length})</span></span><span>{money(sum(rows) / 100)}</span></div>)}</div></details>; })}</div>
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 px-4 py-3 ${difference !== 0 ? "border-error bg-error/5 text-error" : "border-primary/40 bg-primary/5"}`}><strong>Total Geral</strong><strong className="text-xl">{money(grand / 100)}</strong><span className="basis-full text-xs">{difference === 0 ? "Colaboradores = departamentos = empresas = total · diferença R$ 0,00" : `Inconsistência: diferença ${money(difference / 100)}`}</span></div>
      </> : <div className="card"><EmptyState title="Nenhum lançamento nesta competência." /></div>}
    </section>}

    <HolidayModal date={holidayDate} holiday={holidayDate ? holidayByDate.get(holidayDate) ?? null : null} onClose={() => setHolidayDate(null)} onSave={saveHoliday} onRemove={removeHoliday} />
    <CorrectionModal target={correcting} companies={companies} onClose={() => setCorrecting(null)} onSaved={reload} />
    <CompanyModal open={companyModal} onClose={() => setCompanyModal(false)} onCreated={(company) => setCompanies((current) => [...current, company])} />
    <DeletionModal open={deleteTarget !== null} title="Cancelar todo o lançamento?" description="O lançamento e a obrigação serão cancelados." count={1} requireKeyword busy={deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={confirmDelete} />
    {deleteError && <div role="alert" className="alert alert-error text-sm">{deleteError}</div>}
  </div>;
}
