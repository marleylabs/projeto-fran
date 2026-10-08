"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence/target changes load a persisted server snapshot */
// Subseção "Café da Manhã" de Despesas → Alimentação. Reaproveita a experiência já aprovada do
// Vale Transporte (calendário/feriados, seleção de empresa/colaboradores, snapshots, correção,
// rateio, resumo, XLSX) via os componentes compartilhados em @/components/allocation e as
// funções puras de calendário/feriados em @/modules/shared — mas com domínio de dados próprio
// (BreakfastCompetence/Map/Allocation), sem nenhuma relação com TransitVoucher*.
// Fase 7F: apresentação no Design System (Tabs, DataTable, CalculatedValue, ImportFlow, Dialog, AllocationViews).
// Estado, chamadas de API, prévia de cálculo e save continuam AQUI; os componentes em ./ui só exibem.
import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CompetenceCalendar, HolidayModal } from "@/components/allocation/CompetenceHolidays";
import { CompanyModal, companyLabel, normalizeText as normalize, type Company } from "@/components/allocation/CompanyPicker";
import { Button, CalculatedValue, Card, CardHeader, DeletionModal, Dialog, FeedbackAlert, Field, TabPanel, Tabs, TextInput, textInputClassName, useToast } from "@/components/ui";
import { type CollaboratorOption } from "@/components/CollaboratorCombobox";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { BasicBasketCompetenceSummary as CompetenceSummary } from "@/modules/accounts-payable/basic-basket/ui/BasicBasketCompetenceSummary";
import { BREAKFAST_ALLOWED_DEPARTMENT, calculateBreakfastEmployeeTotal, calculateFinalQuantity, parseUnitPriceToCents, type BreakfastObservationKind } from "./calculations";
import { groupBreakfastByCompanyCostCenter } from "./rateio";
import { applyBreakfastExtraSuggestions } from "./point-mirror";
import { triggerDownload } from "@/lib/export/download";
import { BreakfastAllocationView } from "./ui/BreakfastAllocationView";
import { BreakfastFillTable } from "./ui/BreakfastFillTable";
import { BreakfastPointMirror, type BreakfastPointMirrorPreview as PointMirrorPreview } from "./ui/BreakfastPointMirror";
import { BreakfastSummaryView } from "./ui/BreakfastSummaryView";
import { dayMonth, money, moneyCents, people } from "./ui/format";
import type { BreakfastAllocationRow as Allocation, BreakfastContext as Context, BreakfastEntity as Entity, BreakfastEntryValue as EntryValue, BreakfastMapData as MapData } from "./ui/types";

const STAGES = [{ value: "preenchimento", label: "Preenchimento" }, { value: "rateio", label: "Rateio" }, { value: "resumo", label: "Resumo" }];
const cents = (value: string | number) => Math.round(Number(value) * 100);
// O mapa é a fonte histórica: valor unitário e dias úteis vêm dos registros do próprio mapa, nunca da competência atual.
const mapBase = (map: MapData | undefined) => { const row = map?.allocations.find((item) => item.workingDays !== null && item.unitPrice !== null); return row ? { workingDays: row.workingDays as number, unitPrice: Number(row.unitPrice).toFixed(2) } : null; };
const isInt = (value: string) => /^-?\d+$/.test(value.trim());
// Cadastros compatíveis com Alimentação ou Café da Manhã (nunca nome de fornecedor fixo no componente).
const matchesActivity = (activityArea: string) => { const value = normalize(activityArea); return value.includes("alimenta") || value.includes("cafe"); };

function CorrectionModal({ target, companies, onClose, onSaved }: { target: { mapId: string; row: Allocation } | null; companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const formId = `${useId()}-correction`;
  const [form, setForm] = useState({ companyText: "", extra: "0", discount: "0", obsType: "" as "" | BreakfastObservationKind, obsDetails: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
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
            <div><dt className="text-foreground-muted">Valor unitário</dt><dd className="font-semibold tabular-nums">{row.unitPrice ? money(row.unitPrice) : "—"}</dd></div>
            <div><dt className="text-foreground-muted">Dias úteis / Quantidade</dt><dd className="font-semibold tabular-nums">{row.workingDays ?? "—"}</dd></div>
            <div><dt className="text-foreground-muted">Departamento</dt><dd className="font-semibold">{row.department ?? "—"}</dd></div>
            <div><dt className="text-foreground-muted">Centro de custo</dt><dd className="font-semibold">{row.costCenter ?? "—"}</dd></div>
          </dl>
        )}
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        <Field label="Empresa">{(control) => <><input {...control} list="cafe-companies-correction" className={textInputClassName} value={form.companyText} onChange={(event) => setForm({ ...form, companyText: event.target.value })} /><datalist id="cafe-companies-correction">{companies.map((item) => <option key={item.id} value={companyLabel(item)} />)}</datalist></>}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Desconto (quantidade)">{(control) => <TextInput {...control} type="number" inputMode="numeric" min={0} step={1} className="tabular-nums" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} />}</Field>
          <Field label="Quantidade extras">{(control) => <TextInput {...control} type="number" inputMode="numeric" min={0} step={1} className="tabular-nums" value={form.extra} onChange={(event) => setForm({ ...form, extra: event.target.value })} />}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label="Observação">{(control) => <select {...control} className={textInputClassName} value={form.obsType} onChange={(event) => setForm({ ...form, obsType: event.target.value as "" | BreakfastObservationKind })}><option value="">—</option><option value="RETROACTIVE">Retroativo</option><option value="OTHER">Outros</option></select>}</Field>
          {form.obsType && <Field label="Detalhes">{(control) => <TextInput {...control} value={form.obsDetails} onChange={(event) => setForm({ ...form, obsDetails: event.target.value })} />}</Field>}
        </div>
        <Field label="Motivo da correção" required>{(control) => <TextInput {...control} required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />}</Field>
      </form>
    </Dialog>
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
  // Máscara Flash: gerada no backend a partir do lançamento salvo; erros de validação (sem CNPJ,
  // sem colaboradores, total divergente) chegam como JSON e viram toast — nenhum arquivo parcial.
  const [flashBusy, setFlashBusy] = useState<string | null>(null);
  async function downloadFlash(mapId: string) {
    setFlashBusy(mapId);
    try {
      const response = await fetch(`/api/accounts-payable/breakfast/${mapId}/flash`);
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Falha ao gerar a Máscara Flash."); }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "Mascara_Flash_Cafe_Manha.xlsx";
      triggerDownload(await response.blob(), filename);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao gerar a Máscara Flash.", "Máscara Flash"); } finally { setFlashBusy(null); }
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

  // ---- Espelho de Ponto: só SUGERE Quantidade Extras. Processado no servidor (match por CPF, sem
  // devolver CPF completo); nada muda nos inputs até o usuário clicar em "Aplicar Quantidades Extras",
  // que ATRIBUI o valor (idempotente). Depois disso o campo segue livre para edição manual.
  const [pointFile, setPointFile] = useState<File | null>(null);
  const [pointBusy, setPointBusy] = useState(false);
  const [pointMirror, setPointMirror] = useState<(PointMirrorPreview & { competence: string }) | null>(null);
  // Só exibição: quantos colaboradores receberam as extras desta prévia (etapa "Resultado" do ImportFlow).
  const [pointApplied, setPointApplied] = useState<number | null>(null);
  async function processPointMirror() {
    if (!pointFile) return; setPointBusy(true); setPointApplied(null);
    try {
      const data = new FormData(); data.set("file", pointFile); data.set("selectedIds", JSON.stringify(selectedIds));
      const response = await fetch("/api/accounts-payable/breakfast/point-mirror", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível processar o Espelho de Ponto.");
      setPointMirror({ ...(body as PointMirrorPreview), competence });
    } catch (cause) { setPointMirror(null); toast.error(cause instanceof Error ? cause.message : "Falha ao processar o Espelho de Ponto.", "Espelho de Ponto"); }
    finally { setPointBusy(false); }
  }
  function applyPointMirror() {
    if (!pointMirror) return;
    const applicable = pointMirror.people.filter((person) => person.status === "APPLY" && person.employeeId && selectedIds.includes(person.employeeId)) as Array<PointMirrorPreview["people"][number] & { employeeId: string }>;
    setValues((current) => applyBreakfastExtraSuggestions(current, applicable));
    setPointApplied(applicable.length);
    toast.success(`Quantidade Extras aplicada para ${applicable.length} colaborador(es). Os valores continuam editáveis.`);
  }
  const resetPointMirror = () => { setPointFile(null); setPointMirror(null); setPointApplied(null); };
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

  // ---- Agregações de leitura; nada persistido/duplicado. Rateio (aba Rateio) mantém as quatro perspectivas
  // (padrão Empresa → Departamento → Colaborador); o consolidado do Resumo é Empresa → Centro de Custo (snapshot).
  const all = maps.flatMap((map) => map.allocations);
  const rateio = useMemo(() => groupBreakfastByCompanyCostCenter(all), [all]);
  const sum = (rows: Allocation[]) => rows.reduce((total, row) => total + cents(row.amount), 0);
  const grand = sum(all);
  const mapsTotal = maps.reduce((total, map) => total + cents(map.totalAmount), 0);
  const difference = (grand - rateio.companiesCents) + (grand - rateio.costCentersCents) + (grand - mapsTotal);
  const uniquePeople = new Set(all.map((row) => row.employeeId ?? normalize(row.employeeName))).size;
  const totalMeals = all.reduce((total, row) => total + (row.finalQuantity ?? 0), 0);
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  const severalDays = [...new Set(maps.map((map) => mapBase(map)?.workingDays))].length > 1;
  const severalPrices = [...new Set(maps.map((map) => mapBase(map)?.unitPrice))].length > 1;

  return <div className="grid gap-5">
    <div>
      <h2 className="text-section-title text-foreground">Café da Manhã</h2>
      <p className="mt-0.5 text-body text-foreground-muted">Quantidade por dias úteis da competência, com Desconto e Quantidade Extras (Espelho de Ponto) por colaborador do {BREAKFAST_ALLOWED_DEPARTMENT}.</p>
    </div>
    <Tabs label="Etapas do Café da Manhã" items={STAGES} value={tab} onValueChange={(value) => setTab(value as typeof tab)} variant="segmented">
      <TabPanel value="preenchimento" className="mt-4">
        <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <Card padding="none">
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <CardHeader titleAs="h3" title="Competência, calendário e valor" description="Dias úteis = segunda a sexta menos os feriados em dias úteis." />
                <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[12rem_16rem]">
                  <Field label="Competência" required>{(control) => <input {...control} type="month" className={textInputClassName} value={competence} onChange={(event) => { setCompetence(event.target.value); setPointMirror(null); setPointApplied(null); }} />}</Field>
                  <Field label="Cadastro da obrigação" required>{(control) => <select {...control} required className={textInputClassName} value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select>}</Field>
                </div>
              </div>
              <CompetenceSummary items={[
                { label: "Competência", value: monthLabel },
                { label: "Dias úteis", value: String(ctx?.workingDays ?? "—"), helper: ctx ? `${ctx.weekdays} seg–sex − ${ctx.holidaysOnWeekdays} feriado(s)` : undefined },
                { label: "Feriados", value: String(ctx?.holidaysInMonth ?? "—"), helper: "No mês" },
                { label: "Valor unitário", value: basePrice ? money(basePrice) : "—", helper: entityBase ? "Base histórica do mapa" : ctx?.unitPriceDefined ? "Salvo na competência" : "Padrão (não salvo)" },
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
                  <h4 className="mb-2 text-label text-foreground-muted">Feriados cadastrados{ctx ? ` (${ctx.holidays.length})` : ""}</h4>
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
                    <Field label="Valor unitário do café da manhã (R$)" className="min-w-40 flex-1">{(control) => <TextInput {...control} inputMode="decimal" className="tabular-nums" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />}</Field>
                    <Button variant="secondary" onClick={savePrice} disabled={!priceDirty}>Salvar valor</Button>
                  </div>
                  <p className="text-caption text-foreground-muted">{ctx?.unitPriceDefined ? "Valor salvo nesta competência; lançamentos antigos não mudam se ele for alterado." : "Valor padrão R$ 12,50 (ainda não salvo para esta competência)."}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="grid gap-4">
            <CardHeader titleAs="h3" title="Colaboradores" description={`Somente ${BREAKFAST_ALLOWED_DEPARTMENT}. A empresa começa com o padrão de cada colaborador e continua editável por linha.`} />
            {entityBase && <FeedbackAlert status="info">Este lançamento já possui mapa: novos colaboradores usarão a base histórica do mapa ({entityBase.workingDays} dias úteis · {money(entityBase.unitPrice)} por café), mesmo que a competência tenha sido alterada depois.</FeedbackAlert>}
            <CollaboratorMultiCombobox value={selectedIds} options={topogeoCollaborators} onChange={changeSelection} fixedDepartment={BREAKFAST_ALLOWED_DEPARTMENT} />
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-end gap-3 rounded-control border border-border bg-surface-muted p-3" role="group" aria-label="Aplicar a todos os selecionados">
                <datalist id="cafe-companies">{companies.map((company) => <option key={company.id} value={companyLabel(company)} />)}</datalist>
                <Field label="Empresa para todos os selecionados" className="min-w-56 flex-1">{(control) => <input {...control} list="cafe-companies" className={textInputClassName} value={bulkCompany} onChange={(event) => applyCompany(event.target.value)} placeholder="Digite para buscar" />}</Field>
                <Button variant="secondary" onClick={() => setCompanyModal(true)}>Cadastrar empresa</Button>
              </div>
            )}
          </Card>

          <Card>
            <BreakfastPointMirror
              description="Sugere Quantidade Extras: +1 por data trabalhada em sábado, domingo ou feriado (Horas Trabalhadas > 00:00 e Jornada diferente de “Trabalho Esperado”), no máximo +1 por colaborador/data. Identificação somente por CPF. Nada é alterado antes de aplicar."
              file={pointFile}
              busy={pointBusy}
              preview={pointMirror}
              stale={Boolean(pointMirror && pointMirror.competence !== competence)}
              appliedCount={pointApplied}
              monthLabel={monthLabel}
              currentExtra={(employeeId) => (employeeId && values[employeeId] && selectedIds.includes(employeeId) ? values[employeeId].extra : undefined)}
              onSelect={(file) => { setPointFile(file); setPointMirror(null); setPointApplied(null); }}
              onClearFile={resetPointMirror}
              onProcess={processPointMirror}
              onApply={applyPointMirror}
              onReset={resetPointMirror}
            />
          </Card>

          {selectedIds.length > 0 && (
            <BreakfastFillTable
              rows={preview}
              values={values}
              baseDays={baseDays}
              unitPrice={basePrice}
              companyListId="cafe-companies"
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
        <BreakfastAllocationView maps={maps} monthLabel={monthLabel} baseOf={(map) => mapBase(map) ?? { workingDays: ctx?.workingDays ?? null, unitPrice: ctx?.unitPrice ?? null }} onCorrect={(mapId, row) => setCorrecting({ mapId, row })} onCancel={(mapId) => setDeleteTarget({ mapId })} onFlash={downloadFlash} flashBusy={flashBusy} />
      </TabPanel>

      <TabPanel value="resumo" className="mt-4">
        <BreakfastSummaryView summary={rateio} difference={difference} indicators={[
          { label: "Empresas", value: rateio.companies.length },
          { label: "Colaboradores", value: uniquePeople },
          { label: "Dias úteis", value: severalDays ? "Vários" : String(mapBase(maps[0])?.workingDays ?? ctx?.workingDays ?? "—") },
          { label: "Quantidade de cafés", value: totalMeals },
          { label: "Valor unitário", value: severalPrices ? "Vários" : mapBase(maps[0]) ? money(mapBase(maps[0])!.unitPrice) : ctx ? money(ctx.unitPrice) : "—" },
          { label: "Total Geral", value: moneyCents(grand), emphasis: true },
        ]} />
      </TabPanel>
    </Tabs>

    <HolidayModal date={holidayDate} holiday={holidayDate ? holidayByDate.get(holidayDate) ?? null : null} onClose={() => setHolidayDate(null)} onSave={saveHoliday} onRemove={removeHoliday} />
    <CorrectionModal target={correcting} companies={companies} onClose={() => setCorrecting(null)} onSaved={reload} />
    <CompanyModal open={companyModal} onClose={() => setCompanyModal(false)} onCreated={(company) => setCompanies((current) => [...current, company])} />
    <DeletionModal open={deleteTarget !== null} title="Cancelar todo o lançamento?" description="O lançamento e a obrigação serão cancelados." count={1} requireKeyword busy={deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={confirmDelete} />
    {deleteError && <FeedbackAlert status="error">{deleteError}</FeedbackAlert>}
  </div>;
}
