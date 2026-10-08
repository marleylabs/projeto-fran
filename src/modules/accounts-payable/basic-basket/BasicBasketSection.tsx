"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence/target changes load a persisted server snapshot */
// Subseção "Cesta Básica" de Despesas → Alimentação. Mesma experiência do Café da Manhã
// (Preenchimento → Rateio → Resumo, empresa por colaborador, correção com histórico, XLSX), com domínio
// próprio (BasicBasket*). Calendário só visual (sem dias úteis); pagamento = 2ª quarta-feira. O valor informado
// é a Cesta MENSAL cheia; a Cesta paga (proporcional à admissão na competência) e o Retroativo (mês anterior)
// são prévias — o servidor recalcula tudo pela Data de Admissão do cadastro.
// Fase 7E: apresentação no Design System (Tabs, DataTable, CurrencyInput, CalculatedValue, ImportFlow, Dialog).
// Estado, chamadas de API, prévia de cálculo e save continuam AQUI; os componentes em ./ui só exibem.
import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { CompanyModal, companyLabel, normalizeText as normalize, type Company } from "@/components/allocation/CompanyPicker";
import { Button, CalculatedValue, Card, CardHeader, CurrencyInput, DataTable, DeletionModal, Dialog, FeedbackAlert, Field, StatusBadge, TabPanel, Tabs, TextInput, textInputClassName, useToast, type DataTableColumn } from "@/components/ui";
import { type CollaboratorOption } from "@/components/CollaboratorCombobox";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { formatDateOnlyBR } from "@/lib/date-only";
import { triggerDownload } from "@/lib/export/download";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { BASIC_BASKET_CALCULATION_DAYS, calculateBasicBasketLine, NO_BASIC_BASKET_ADJUSTMENTS, parseMoneyToCents, type BasicBasketAdjustments, type BasicBasketHoliday, type CurrentBasketStatus, type RetroactiveStatus } from "./calculations";
import { groupBasicBasketByCompanyCostCenter } from "./rateio";
import { BasicBasketAllocationView } from "./ui/BasicBasketAllocationView";
import { BasicBasketCalendar, BasicBasketHolidayList } from "./ui/BasicBasketCalendar";
import { BasicBasketCompetenceSummary } from "./ui/BasicBasketCompetenceSummary";
import { BasicBasketPointMirror, type PointMirrorPerson, type PointMirrorPreview, type PointMirrorStatus } from "./ui/BasicBasketPointMirror";
import { BasicBasketSummaryView } from "./ui/BasicBasketSummaryView";
import { adjustmentNote, moneyCents, people } from "./ui/format";
import { Disclosure, InfoTip, Note } from "./ui/parts";
import type { BasicBasketAllocationRow as Allocation, BasicBasketEntity as Entity, BasicBasketMapData as MapData } from "./ui/types";

// Espelho de Ponto (Falta Injustificada / Férias): prévia vinda do servidor. "Aplicar" só guarda o id da importação
// e os ajustes para a PRÉVIA da tela; ao salvar, o servidor relê a importação e recalcula tudo.
type AppliedPointMirror = { importId: string; competence: string; byEmployee: Record<string, BasicBasketAdjustments> };
const POINT_STATUS_LABEL: Record<PointMirrorStatus, string> = { ABSENCE: "Cesta cortada — Falta Injustificada", VACATION: "Férias", NEXT_COMPETENCE: "Afeta a próxima competência", BEFORE_ADMISSION: "Ocorrência anterior à admissão — ignorada", NO_OCCURRENCE: "Sem ajuste", OUT_OF_PERIOD: "Fora do período de apuração", NOT_SELECTED: "Encontrado no arquivo, mas não selecionado", NOT_ELIGIBLE: "Inativo/mesclado — não aplicado", NOT_FOUND: "Não localizado (CPF)", INVALID_CPF: "CPF inválido", NOT_IN_FILE: "Selecionado, não está no arquivo — sem ajuste", MISSING_ADMISSION: "Sem Data de Admissão — não aplicado" };
const pointStatusText = (person: PointMirrorPerson) => {
  const a = person.adjustments;
  if (person.status === "ABSENCE" && a) return [a.currentUnjustifiedAbsence ? "Cesta cortada — Falta Injustificada" : "", a.retroactiveUnjustifiedAbsence ? "Retroativo cortado — Falta Injustificada no mês do Retroativo" : ""].filter(Boolean).join(" · ");
  if (person.status === "VACATION" && a) return [a.currentVacationDays ? `Férias — ${a.currentVacationDays} dias` : "", a.retroactiveVacationDays ? `Férias no Retroativo — ${a.retroactiveVacationDays} dias` : ""].filter(Boolean).join(" · ");
  return POINT_STATUS_LABEL[person.status];
};

type Person = { employeeId: string; currentStatus: CurrentBasketStatus; currentBasketDays: number; retroactiveStatus: RetroactiveStatus; retroactiveDays: number; admissionDate?: string };
type Context = { year: number; month: number; daysInMonth: number; previousPaymentDate: string; paymentDate: string; currentMonthStart: string; currentMonthEnd: string; calculationDays: number; referenceYear: number; referenceMonth: number; referenceMonthStart: string; referenceMonthEnd: string; holidays: BasicBasketHoliday[]; people: Person[] };
const snapshotAdjustments = (row: Allocation): BasicBasketAdjustments => ({ currentVacationDays: row.currentVacationDays, currentUnjustifiedAbsence: row.currentUnjustifiedAbsence, retroactiveVacationDays: row.retroactiveVacationDays, retroactiveUnjustifiedAbsence: row.retroactiveUnjustifiedAbsence });
type Config = { companyId: string | null; driverBonus: string; agreementAmount: string; basketAmount: string };
type EntryValue = { companyText: string; companyId: string; driverBonus: string; agreement: string; basket: string; observation: string };

const toInput = (decimal: string | undefined) => (decimal && Number(decimal) ? Number(decimal).toFixed(2).replace(".", ",") : "0,00");
// CurrencyInput ↔ texto guardado pela tela. A tela continua dona do TEXTO enviado ao servidor; o número exibido é lido
// com o MESMO parser do cálculo (parseMoneyToCents) e a digitação vira texto com 2 casas (sem arredondar: o
// CurrencyInput recusa mais de 2 casas). Campo vazio continua "" (0 para o cálculo, como antes).
const currencyValue = (text: string) => { if (!text.trim()) return null; try { return parseMoneyToCents(text, "Valor") / 100; } catch { return null; } };
const currencyText = (value: number | null) => (value === null ? "" : value.toFixed(2).replace(".", ","));
const MISSING_ADMISSION = "Informe a Data de Admissão do colaborador para calcular a Cesta Básica.";
// Fornecedores do domínio Alimentação (mesmo critério do Café da Manhã, sem nome fixo) + área "Cesta".
const matchesActivity = (activityArea: string) => { const value = normalize(activityArea); return value.includes("alimenta") || value.includes("cesta"); };
// Rótulo curto do Retroativo na tabela ("10 de 30 dias" ou o motivo de não haver Retroativo).
const retroLabel = (status: RetroactiveStatus, days: number, monthDays: number) => (status === "PRORATED" ? `${days} de ${monthDays} dias` : status === "MISSING_ADMISSION" ? "Sem admissão" : status === "CURRENT_OR_LATER" ? "Admissão na competência atual" : "Sem retroativo");
// Dica: o Retroativo compensa só o MÊS ANTERIOR (admitidos depois do pagamento anterior e ainda naquele mês).
const retroDetail = (status: RetroactiveStatus, info: { admissionDate?: string | null; previousPaymentDate: string; referenceMonthEnd: string; days: number; monthDays: number; cents: number }) =>
  status === "MISSING_ADMISSION" ? "Data de Admissão não cadastrada."
    : status === "CURRENT_OR_LATER" ? "Admissão na competência atual (ou depois do mês de referência): sem Retroativo; a Cesta desta competência já considera a proporcionalidade."
    : status === "NONE" ? `Admitido até o pagamento anterior (${formatDateOnlyBR(info.previousPaymentDate)}): o mês anterior já foi pago, sem Retroativo.`
    : `Admissão: ${formatDateOnlyBR(info.admissionDate)} · Pagamento anterior: ${formatDateOnlyBR(info.previousPaymentDate)} · Período retroativo: ${formatDateOnlyBR(info.admissionDate)} a ${formatDateOnlyBR(info.referenceMonthEnd)} · Dias: ${info.days} de ${info.monthDays} · Valor: ${moneyCents(info.cents)}`;

// Situação da Cesta da competência: dias de direito e valor a pagar (texto completo da dica).
const basketLabel = (status: CurrentBasketStatus, days: number, monthDays: number, payableCents: number) => (status === "FULL_MONTH" ? `Mês completo · ${days} de ${monthDays} dias` : status === "PRORATED" ? `${days} de ${monthDays} dias · A pagar: ${moneyCents(payableCents)}` : status === "AFTER_PAYMENT" ? "R$ 0,00 a pagar — Receberá na próxima competência" : "Sem Data de Admissão");
const basketDetail = (status: CurrentBasketStatus, info: { admissionDate?: string | null; paymentDate: string; currentMonthEnd: string; days: number; monthDays: number }) =>
  status === "FULL_MONTH" ? "Admitido até o 1º dia da competência: Cesta do mês completo."
    : status === "PRORATED" ? `Admissão: ${formatDateOnlyBR(info.admissionDate)} · ${info.days} de ${info.monthDays} dias (base comercial: ${BASIC_BASKET_CALCULATION_DAYS} − dia da admissão + 1)`
    : status === "AFTER_PAYMENT" ? `Admissão (${formatDateOnlyBR(info.admissionDate)}) após o pagamento (${formatDateOnlyBR(info.paymentDate)}): receberá a Cesta e o Retroativo na próxima competência.` : MISSING_ADMISSION;

function CorrectionModal({ target, companies, onClose, onSaved }: { target: { map: MapData; row: Allocation } | null; companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const formId = `${useId()}-correction`;
  const [form, setForm] = useState({ companyText: "", driverBonus: "", agreement: "", basket: "", observation: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (target) { const row = target.row; setError(null); setForm({ companyText: row.company, driverBonus: toInput(row.driverBonus), agreement: toInput(row.agreementAmount), basket: toInput(row.monthlyBasketAmount), observation: row.observation ?? "", reason: "" }); }
  }, [target]);
  const company = companies.find((item) => normalize(companyLabel(item)) === normalize(form.companyText) || normalize(item.legalName) === normalize(form.companyText));
  const preview = useMemo(() => { try { return calculateBasicBasketLine({ driverBonusCents: parseMoneyToCents(form.driverBonus, "Bonificação Condutor"), agreementCents: parseMoneyToCents(form.agreement, "Acordo"), monthlyBasketCents: parseMoneyToCents(form.basket, "Cesta Básica"), currentBasketDays: target?.row.currentBasketDays ?? 0, retroactiveDays: target?.row.retroactiveDays ?? 0, adjustments: target ? snapshotAdjustments(target.row) : undefined }); } catch { return null; } }, [form, target]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!target?.row.employeeId) return;
    const sameCompany = target.row.companyId && normalize(form.companyText) === normalize(target.row.company);
    const companyId = company?.id ?? (sameCompany ? target.row.companyId : null);
    if (!companyId) return setError("Selecione uma empresa cadastrada.");
    if (!preview) return setError("Revise os valores (sem negativos, até 2 casas decimais).");
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/accounts-payable/basic-basket/${target.map.id}/entries/${target.row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: form.reason, entry: { employeeId: target.row.employeeId, companyId, driverBonus: form.driverBonus, agreementAmount: form.agreement, basketAmount: form.basket, observation: form.observation } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Falha ao corrigir.");
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao corrigir."); } finally { setBusy(false); }
  }
  const row = target?.row;
  const note = (absence: boolean, vacation: number, payable: number) => adjustmentNote(absence, vacation, payable);
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Corrigir lançamento"
      description={`${row?.employeeName ?? ""} · o registro atual é cancelado (com histórico) e um novo é gerado. Data de Admissão e ciclo de pagamento usados no lançamento são preservados; Cesta paga, Retroativo e Total são recalculados a partir do valor mensal.`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" form={formId} loading={busy} disabled={busy || !form.reason.trim()}>Salvar correção</Button></>}
    >
      <form id={formId} onSubmit={submit} className="grid gap-4">
        {target && row && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-control border border-border bg-surface-muted p-3 text-caption sm:grid-cols-4" aria-label="Base histórica preservada">
            <div><dt className="text-foreground-muted">Pagamentos</dt><dd className="font-semibold tabular-nums">{formatDateOnlyBR(target.map.previousPaymentDate)} → {formatDateOnlyBR(target.map.paymentDate)}</dd></div>
            <div><dt className="text-foreground-muted">Admissão usada</dt><dd className="font-semibold tabular-nums">{formatDateOnlyBR(row.admissionDate) || "—"}</dd></div>
            <div><dt className="text-foreground-muted">Dias de direito à Cesta</dt><dd className="font-semibold tabular-nums">{row.currentBasketDays} de {row.currentCalculationDays}</dd></div>
            <div><dt className="text-foreground-muted">Dias retroativos</dt><dd className="font-semibold tabular-nums">{row.retroactiveDays ? `${row.retroactiveDays} de ${row.referenceCalculationDays}` : "Sem retroativo"}</dd></div>
            <div><dt className="text-foreground-muted">Departamento</dt><dd className="font-semibold">{row.department ?? "—"}</dd></div>
            <div className="col-span-2 sm:col-span-3"><dt className="text-foreground-muted">Espelho de Ponto (preservado)</dt><dd className="font-semibold">{[note(row.currentUnjustifiedAbsence, row.currentVacationDays, row.currentPayableDays) && `Cesta: ${note(row.currentUnjustifiedAbsence, row.currentVacationDays, row.currentPayableDays)}`, note(row.retroactiveUnjustifiedAbsence, row.retroactiveVacationDays, row.retroactivePayableDays) && `Retroativo: ${note(row.retroactiveUnjustifiedAbsence, row.retroactiveVacationDays, row.retroactivePayableDays)}`].filter(Boolean).join(" · ") || "Sem Falta Injustificada nem Férias"}</dd></div>
          </dl>
        )}
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
        <Field label="Empresa">{(control) => <><input {...control} list="cesta-companies-correction" className={textInputClassName} value={form.companyText} onChange={(event) => setForm({ ...form, companyText: event.target.value })} /><datalist id="cesta-companies-correction">{companies.map((item) => <option key={item.id} value={companyLabel(item)} />)}</datalist></>}</Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bonificação Condutor (R$)">{(control) => <CurrencyInput {...control} value={currencyValue(form.driverBonus)} onValueChange={(value) => setForm({ ...form, driverBonus: currencyText(value) })} />}</Field>
          <Field label="Acordo (R$)">{(control) => <CurrencyInput {...control} value={currencyValue(form.agreement)} onValueChange={(value) => setForm({ ...form, agreement: currencyText(value) })} />}</Field>
          <Field label="Valor mensal da Cesta (R$)">{(control) => <CurrencyInput {...control} value={currencyValue(form.basket)} onValueChange={(value) => setForm({ ...form, basket: currencyText(value) })} />}</Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-3" aria-live="polite">
          <CalculatedValue label="Cesta paga" value={preview ? moneyCents(preview.payableBasketCents) : "—"} helper={row ? `${row.currentBasketDays} de ${row.currentCalculationDays} dias de direito` : undefined} />
          <CalculatedValue label="Retroativo" value={preview ? moneyCents(preview.retroactiveCents) : "—"} />
          <CalculatedValue label="Total" value={preview ? moneyCents(preview.totalCents) : "—"} size="lg" />
        </div>
        <Field label="Observação">{(control) => <TextInput {...control} maxLength={500} value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} />}</Field>
        <Field label="Motivo da correção" required>{(control) => <TextInput {...control} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />}</Field>
      </form>
    </Dialog>
  );
}

const STAGES = [{ value: "preenchimento", label: "Preenchimento" }, { value: "rateio", label: "Rateio" }, { value: "resumo", label: "Resumo" }];

export function BasicBasketSection() {
  const toast = useToast();
  const now = new Date();
  const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = competence.split("-").map(Number);
  const [tab, setTab] = useState<"preenchimento" | "rateio" | "resumo">("preenchimento");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [ctx, setCtx] = useState<Context | null>(null);
  const [maps, setMaps] = useState<MapData[]>([]);
  const [entityId, setEntityId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, EntryValue>>({});
  const [bulkCompany, setBulkCompany] = useState("");
  const [bulkBasket, setBulkBasket] = useState("");
  const [companyModal, setCompanyModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ mapId: string } | null>(null);
  const [correcting, setCorrecting] = useState<{ map: MapData; row: Allocation } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadContext = useCallback(async () => { const response = await fetch(`/api/accounts-payable/basic-basket/context?year=${year}&month=${month}`); const body = await response.json(); if (!response.ok) throw new Error(body.error); setCtx(body); }, [year, month]);
  const loadMaps = useCallback(async () => { const response = await fetch(`/api/accounts-payable/basic-basket?year=${year}&month=${month}`); const body = await response.json(); if (!response.ok) throw new Error(body.error); setMaps(body.competence?.maps ?? []); }, [year, month]);
  const reload = useCallback(async () => { await Promise.all([loadContext(), loadMaps()]); }, [loadContext, loadMaps]);
  useEffect(() => { reload().catch(() => setError("Falha ao carregar a competência.")); }, [reload]);
  const loadConfigs = useCallback(async () => { const body = await fetch("/api/accounts-payable/basic-basket/employee-config").then((r) => r.json()); setConfigs(Object.fromEntries((body.items ?? []).map((item: { employeeId: string; defaultCompanyId: string | null; driverBonus: string; agreementAmount: string; basketAmount: string }) => [item.employeeId, { companyId: item.defaultCompanyId, driverBonus: item.driverBonus, agreementAmount: item.agreementAmount, basketAmount: item.basketAmount }]))); }, []);
  useEffect(() => {
    Promise.all([fetch("/api/administrative-entities?q=").then((r) => r.json()), fetch("/api/collaborators?status=active&limit=1000").then((r) => r.json()), fetch("/api/master-data/companies").then((r) => r.json())])
      .then(([entitiesBody, peopleBody, companyBody]) => { setEntities((entitiesBody.items ?? []).filter((entity: Entity) => matchesActivity(entity.activityArea))); setCollaborators(peopleBody.items ?? []); setCompanies((companyBody.items ?? []).filter((company: Company) => company.active)); })
      .catch(() => undefined);
    loadConfigs().catch(() => undefined);
  }, [loadConfigs]);

  const personById = useMemo(() => new Map((ctx?.people ?? []).map((item) => [item.employeeId, item])), [ctx]);
  const companyByText = useCallback((text: string) => companies.find((company) => normalize(companyLabel(company)) === normalize(text) || normalize(company.legalName) === normalize(text)), [companies]);
  async function post(url: string, method: string, payload: unknown) { const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Falha na operação."); return body; }

  // Seleção: pré-preenche empresa e valores com o PADRÃO atual do colaborador; Observação começa vazia.
  function changeSelection(ids: string[]) {
    setSelectedIds(ids);
    setValues((current) => { const next = { ...current }; for (const id of ids) if (!next[id]) { const config = configs[id]; const preset = companies.find((company) => company.id === config?.companyId); next[id] = { companyText: preset ? companyLabel(preset) : "", companyId: preset?.id ?? "", driverBonus: toInput(config?.driverBonus), agreement: toInput(config?.agreementAmount), basket: toInput(config?.basketAmount), observation: "" }; } return next; });
  }
  const patchValue = (id: string, patch: Partial<EntryValue>) => setValues((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  function applyCompany(text: string) { setBulkCompany(text); const company = companyByText(text); if (company) setValues((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, selectedIds.includes(id) ? { ...value, companyText: companyLabel(company), companyId: company.id } : value]))); }
  // Ação EXPLÍCITA: só nas linhas selecionadas; cada linha segue editável depois.
  function applyBulkBasket() {
    try { parseMoneyToCents(bulkBasket, "Cesta Básica"); } catch { return toast.error("Valor da Cesta Básica inválido.", "Aplicar aos selecionados"); }
    setValues((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, selectedIds.includes(id) ? { ...value, basket: bulkBasket } : value])));
    toast.success(`Cesta Básica aplicada a ${selectedIds.length} colaborador(es).`);
  }

  // Espelho de Ponto: processar → conferir → "Aplicar Faltas e Férias" (substitui a aplicação anterior, nunca soma).
  const [pointFile, setPointFile] = useState<File | null>(null);
  const [pointBusy, setPointBusy] = useState(false);
  const [pointPreview, setPointPreview] = useState<(PointMirrorPreview & { competence: string }) | null>(null);
  const [applied, setApplied] = useState<AppliedPointMirror | null>(null);
  const activeApplied = applied && applied.competence === competence ? applied : null;
  const adjustmentsFor = (id: string) => activeApplied?.byEmployee[id] ?? NO_BASIC_BASKET_ADJUSTMENTS;
  async function processPointMirror() {
    if (!pointFile) return; setPointBusy(true);
    try {
      const data = new FormData(); data.set("file", pointFile); data.set("selectedIds", JSON.stringify(selectedIds)); data.set("year", String(year)); data.set("month", String(month));
      const response = await fetch("/api/accounts-payable/basic-basket/point-mirror", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível processar o Espelho de Ponto.");
      setPointPreview({ ...(body as PointMirrorPreview), competence });
    } catch (cause) { setPointPreview(null); toast.error(cause instanceof Error ? cause.message : "Falha ao processar o Espelho de Ponto.", "Espelho de Ponto"); }
    finally { setPointBusy(false); }
  }
  function applyPointMirror() {
    if (!pointPreview || pointPreview.competence !== competence) return;
    const byEmployee = Object.fromEntries(pointPreview.people.filter((person) => person.employeeId && person.adjustments).map((person) => [person.employeeId!, person.adjustments!]));
    setApplied({ importId: pointPreview.importId, competence, byEmployee });
    toast.success(`Faltas e Férias aplicadas à prévia de ${Object.keys(byEmployee).length} colaborador(es). Salve o lançamento para confirmar.`);
  }

  const preview = selectedIds.map((id) => {
    const value = values[id]; const employee = collaborators.find((item) => item.id === id); const person = personById.get(id);
    const status: RetroactiveStatus = person?.retroactiveStatus ?? "MISSING_ADMISSION", currentStatus: CurrentBasketStatus = person?.currentStatus ?? "MISSING_ADMISSION";
    const retroactiveDays = person?.retroactiveDays ?? 0, currentBasketDays = person?.currentBasketDays ?? 0, admissionDate = person?.admissionDate ?? null;
    const adjustments = adjustmentsFor(id);
    const notCovered = Boolean(activeApplied && !activeApplied.byEmployee[id]);
    const base = { id, employee, status, currentStatus, retroactiveDays, currentBasketDays, admissionDate, adjustments, notCovered, currentPayableDays: 0, retroactivePayableDays: 0, payableBasketCents: 0, retroactiveCents: 0, totalCents: 0 };
    if (!value || !ctx) return { ...base, error: "Carregando…" };
    // Sem Data de Admissão o lançamento é BLOQUEADO (mesma regra do servidor).
    if (currentStatus === "MISSING_ADMISSION") return { ...base, error: MISSING_ADMISSION };
    const problems: string[] = []; if (!value.companyId) problems.push("Empresa");
    try {
      const line = calculateBasicBasketLine({ driverBonusCents: parseMoneyToCents(value.driverBonus, "Bonificação Condutor"), agreementCents: parseMoneyToCents(value.agreement, "Acordo"), monthlyBasketCents: parseMoneyToCents(value.basket, "Cesta Básica"), currentBasketDays, retroactiveDays, adjustments });
      // Zero auditável (Falta/Férias) é aceito, como no servidor; admitido após o pagamento continua bloqueado.
      const zeroedByPointMirror = currentStatus !== "AFTER_PAYMENT" && (adjustments.currentUnjustifiedAbsence || adjustments.currentVacationDays > 0 || adjustments.retroactiveUnjustifiedAbsence || adjustments.retroactiveVacationDays > 0);
      if (!line.totalCents && !zeroedByPointMirror) problems.push(currentStatus === "AFTER_PAYMENT" ? "sem valor a pagar nesta competência (remova da seleção)" : "informe ao menos um valor");
      return { ...base, error: problems.length ? `Revise: ${problems.join(", ")}` : null, ...line };
    } catch (cause) { return { ...base, error: cause instanceof Error ? cause.message : "Valor inválido" }; }
  });
  const previewTotal = preview.reduce((sum, row) => sum + row.totalCents, 0);
  const missingAdmission = preview.filter((row) => row.currentStatus === "MISSING_ADMISSION").length;
  const canSave = Boolean(entityId && selectedIds.length && ctx && preview.every((row) => !row.error));
  const hint = !selectedIds.length ? "Selecione ao menos um colaborador." : !entityId ? "Selecione o fornecedor." : preview.find((row) => row.error)?.error ?? null;

  async function save(event: FormEvent) {
    event.preventDefault(); if (!canSave) return; setBusy(true); setError(null);
    try {
      // Só insumos (Cesta = valor MENSAL): o servidor recalcula pagamento, dias, Cesta paga, Retroativo e Total.
      const entries = selectedIds.map((id) => { const value = values[id]; return { employeeId: id, companyId: value.companyId, driverBonus: value.driverBonus, agreementAmount: value.agreement, basketAmount: value.basket, observation: value.observation }; });
      // Espelho de Ponto: só o id da importação aplicada (o servidor relê as datas e recalcula Férias/Falta).
      const body = await post("/api/accounts-payable/basic-basket/entries", "POST", { year, month, administrativeEntityId: entityId, entries, pointMirrorImportId: activeApplied?.importId ?? null });
      setSelectedIds([]); setValues({}); setApplied(null); setPointPreview(null); setPointFile(null); await loadConfigs();
      toast.success(body.duplicateCount ? `${body.createdCount} lançamento(s) salvo(s). ${body.duplicateCount} já lançado(s) nesta competência: ${body.duplicateNames.join(", ")}.` : `${body.createdCount} lançamento(s) de Cesta Básica salvo(s). Rateio gerado.`);
      await reload(); setTab("rateio");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Falha ao salvar lançamentos."; setError(message); toast.error(message, "Não foi possível salvar"); } finally { setBusy(false); }
  }
  // Máscara Flash: gerada no backend a partir do lançamento SALVO (mesmo padrão do Café da Manhã); erros de validação
  // (sem CNPJ, sem colaboradores, total divergente) chegam como JSON e viram toast — nenhum arquivo parcial.
  const [flashBusy, setFlashBusy] = useState<string | null>(null);
  async function downloadFlash(mapId: string) {
    setFlashBusy(mapId);
    try {
      const response = await fetch(`/api/accounts-payable/basic-basket/${mapId}/flash`);
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Falha ao gerar a Máscara Flash."); }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "Mascara_Flash_Cesta_Basica.xlsx";
      triggerDownload(await response.blob(), filename);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao gerar a Máscara Flash.", "Máscara Flash"); } finally { setFlashBusy(null); }
  }
  async function confirmDelete(reason: string) {
    if (!deleteTarget) return; setDeleting(true); setDeleteError(null);
    try { await post(`/api/accounts-payable/basic-basket/${deleteTarget.mapId}`, "DELETE", { reason, confirmation: "EXCLUIR" }); setDeleteTarget(null); await reload(); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Não foi possível excluir."); } finally { setDeleting(false); }
  }

  const all = maps.flatMap((map) => map.allocations);
  const summary = useMemo(() => groupBasicBasketByCompanyCostCenter(all), [all]);
  const mapsTotalCents = maps.reduce((sum, map) => sum + Math.round(Number(map.totalAmount) * 100), 0);
  const difference = summary.totals.totalCents - mapsTotalCents;
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;

  // Comparação antes/depois da prévia do Espelho (mesmo cálculo da linha, sem e com os ajustes do arquivo).
  const comparePointMirror = (person: PointMirrorPerson) => {
    const value = person.employeeId ? values[person.employeeId] : undefined; const row = person.employeeId ? preview.find((item) => item.id === person.employeeId) : undefined;
    if (!value || !row || !person.adjustments) return null;
    try {
      const input = { driverBonusCents: parseMoneyToCents(value.driverBonus, "Bonificação"), agreementCents: parseMoneyToCents(value.agreement, "Acordo"), monthlyBasketCents: parseMoneyToCents(value.basket, "Cesta"), currentBasketDays: row.currentBasketDays, retroactiveDays: row.retroactiveDays };
      return { before: calculateBasicBasketLine(input), after: calculateBasicBasketLine({ ...input, adjustments: person.adjustments }) };
    } catch { return null; }
  };

  type FillRow = (typeof preview)[number];
  const fillRows = preview.filter((row) => values[row.id]);
  const moneyField = (row: FillRow, key: "driverBonus" | "agreement" | "basket", label: string) => {
    const name = row.employee?.officialName;
    return <CurrencyInput aria-label={`${label}${name ? ` de ${name}` : ""}`} value={currencyValue(values[row.id]?.[key] ?? "")} onValueChange={(value) => patchValue(row.id, { [key]: currencyText(value) })} />;
  };
  const fillColumns: DataTableColumn<FillRow>[] = [
    { id: "employee", header: "Colaborador", rowHeader: true, sticky: "start", width: "14rem", cell: (row) => (
      <span className="grid min-w-0">
        <span className="truncate">{row.employee?.officialName}</span>
        <span className="truncate text-caption font-normal text-foreground-muted">{row.employee?.department || "—"}</span>
      </span>
    ) },
    { id: "company", header: "Empresa", width: "14rem", cell: (row) => {
      const value = values[row.id]; const unmatched = Boolean(value.companyText.trim() && !value.companyId); const hintId = `cesta-company-${row.id}`;
      return (
        <span className="grid gap-0.5">
          <input list="cesta-companies" aria-label={`Empresa de ${row.employee?.officialName}`} aria-invalid={unmatched || undefined} aria-describedby={unmatched ? hintId : undefined} className={textInputClassName} value={value.companyText} placeholder="Digite para buscar" onChange={(event) => { const company = companyByText(event.target.value); patchValue(row.id, { companyText: event.target.value, companyId: company?.id ?? "" }); }} />
          {unmatched && <span id={hintId}><Note tone="warning">Selecione uma empresa cadastrada.</Note></span>}
        </span>
      );
    } },
    { id: "driverBonus", header: "Bonificação Condutor", numeric: true, width: "9.5rem", cell: (row) => moneyField(row, "driverBonus", "Bonificação Condutor") },
    { id: "agreement", header: "Acordo", numeric: true, width: "9.5rem", cell: (row) => moneyField(row, "agreement", "Acordo") },
    { id: "monthly", header: "Cesta mensal", numeric: true, width: "10rem", cell: (row) => moneyField(row, "basket", "Valor mensal da Cesta Básica") },
    { id: "paid", header: "Cesta paga", numeric: true, className: "min-w-[12rem]", cell: (row) => {
      const name = row.employee?.officialName ?? "";
      const absence = row.adjustments.currentUnjustifiedAbsence;
      const vacation = adjustmentNote(false, row.adjustments.currentVacationDays, row.currentPayableDays);
      return (
        <span className="inline-grid justify-items-end gap-0.5">
          <span className="inline-flex items-center gap-1">
            <strong>{moneyCents(row.payableBasketCents)}</strong>
            {ctx && <InfoTip label={`Detalhe da Cesta paga de ${name}`} content={`${basketLabel(row.currentStatus, row.currentBasketDays, BASIC_BASKET_CALCULATION_DAYS, row.payableBasketCents)}. ${basketDetail(row.currentStatus, { admissionDate: row.admissionDate, paymentDate: ctx.paymentDate, currentMonthEnd: ctx.currentMonthEnd, days: row.currentBasketDays, monthDays: BASIC_BASKET_CALCULATION_DAYS })}`} />}
          </span>
          {row.currentStatus === "FULL_MONTH" && <Note>Mês completo · {row.currentBasketDays} de {BASIC_BASKET_CALCULATION_DAYS} dias</Note>}
          {row.currentStatus === "PRORATED" && <Note tone="success">{row.currentBasketDays} de {BASIC_BASKET_CALCULATION_DAYS} dias</Note>}
          {row.currentStatus === "AFTER_PAYMENT" && <StatusBadge tone="warning">Receberá na próxima competência</StatusBadge>}
          {row.currentStatus === "MISSING_ADMISSION" && <StatusBadge tone="danger">Sem Data de Admissão</StatusBadge>}
          {absence && <StatusBadge tone="danger">Cesta cortada — Falta Injustificada</StatusBadge>}
          {!absence && vacation && <Note tone="info">{vacation}</Note>}
          {row.notCovered && <Note tone="warning">Fora da importação aplicada (sem ajuste)</Note>}
        </span>
      );
    } },
    { id: "retroactive", header: "Retroativo", numeric: true, className: "min-w-[11rem]", cell: (row) => {
      const name = row.employee?.officialName ?? "";
      const note = adjustmentNote(row.adjustments.retroactiveUnjustifiedAbsence, row.adjustments.retroactiveVacationDays, row.retroactivePayableDays);
      return (
        <span className="inline-grid justify-items-end gap-0.5">
          <span className="inline-flex items-center gap-1">
            <strong>{moneyCents(row.retroactiveCents)}</strong>
            {ctx && <InfoTip label={`Detalhe do Retroativo de ${name}`} content={retroDetail(row.status, { admissionDate: row.admissionDate, previousPaymentDate: ctx.previousPaymentDate, referenceMonthEnd: ctx.referenceMonthEnd, days: row.retroactiveDays, monthDays: BASIC_BASKET_CALCULATION_DAYS, cents: row.retroactiveCents })} />}
          </span>
          <Note tone={row.status === "PRORATED" ? "success" : row.status === "MISSING_ADMISSION" ? "warning" : "muted"}>{retroLabel(row.status, row.retroactiveDays, BASIC_BASKET_CALCULATION_DAYS)}</Note>
          {note && <Note tone={row.adjustments.retroactiveUnjustifiedAbsence ? "danger" : "info"}>{note}</Note>}
        </span>
      );
    } },
    { id: "total", header: "Total", numeric: true, className: "min-w-[9rem]", cell: (row) => (row.error ? <Note tone="danger" className="justify-end text-right">{row.error}</Note> : <strong className="text-card-title">{moneyCents(row.totalCents)}</strong>) },
    { id: "observation", header: "Observação", width: "13rem", cell: (row) => <TextInput aria-label={`Observação de ${row.employee?.officialName}`} maxLength={500} value={values[row.id].observation} onChange={(event) => patchValue(row.id, { observation: event.target.value })} /> },
  ];

  return <div className="grid gap-5">
    <div>
      <h2 className="text-section-title text-foreground">Cesta Básica</h2>
      <p className="mt-0.5 text-body text-foreground-muted">Valor mensal por colaborador, proporcional à admissão, com Retroativo do mês anterior e ajustes do Espelho de Ponto.</p>
    </div>
    <Tabs label="Etapas da Cesta Básica" items={STAGES} value={tab} onValueChange={(value) => setTab(value as typeof tab)} variant="segmented">
      <TabPanel value="preenchimento" className="mt-4">
        <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <Card padding="none">
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <CardHeader titleAs="h3" title="Competência e pagamento" description="Pagamento na 2ª quarta-feira da competência." />
                <Field label="Competência" required className="w-full sm:w-48">{(control) => <input {...control} type="month" className={textInputClassName} value={competence} onChange={(event) => { setCompetence(event.target.value); setPointPreview(null); setApplied(null); }} />}</Field>
              </div>
              <BasicBasketCompetenceSummary items={[
                { label: "Competência", value: monthLabel },
                { label: "Pagamento", value: ctx ? formatDateOnlyBR(ctx.paymentDate) : "—", helper: ctx ? `Anterior: ${formatDateOnlyBR(ctx.previousPaymentDate)}` : undefined },
                { label: "Dias do calendário", value: String(ctx?.daysInMonth ?? "—"), helper: "Mês real (só exibição)" },
                { label: "Base da Cesta", value: `${BASIC_BASKET_CALCULATION_DAYS} dias`, helper: "Fixa em todos os meses" },
                { label: "Colaboradores", value: selectedIds.length, helper: "Selecionados" },
                { label: "Prévia do total", value: moneyCents(previewTotal), helper: "Recalculado ao salvar", emphasis: true },
              ]} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 border-t border-border p-4 sm:p-5 lg:grid-cols-[minmax(0,21rem)_1fr]">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2">
                {ctx ? <BasicBasketCalendar year={year} month={month} holidays={ctx.holidays} paymentDate={ctx.paymentDate} /> : <p className="text-body text-foreground-muted">Carregando calendário…</p>}
                <p className="text-caption text-foreground-muted">Calendário somente leitura: feriados nacionais automáticos e os feriados manuais já cadastrados no Vale Transporte e no Café da Manhã (para editá-los, use o módulo de origem).</p>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
                <div>
                  <h4 className="mb-2 text-label text-foreground-muted">Feriados da competência{ctx ? ` (${ctx.holidays.length})` : ""}</h4>
                  {ctx && <BasicBasketHolidayList holidays={ctx.holidays} />}
                </div>
                {ctx && (
                  <Disclosure title="Como a Cesta é calculada nesta competência" level={2}>
                    <p className="text-caption text-foreground-muted">Cesta da competência: mês completo para admitidos até {formatDateOnlyBR(ctx.currentMonthStart)}; admitidos até o pagamento ({formatDateOnlyBR(ctx.paymentDate)}) recebem valor mensal × ({BASIC_BASKET_CALCULATION_DAYS} − dia da admissão + 1) ÷ {BASIC_BASKET_CALCULATION_DAYS}; admitidos depois recebem na próxima competência. Retroativo: só para admitidos depois do pagamento anterior ({formatDateOnlyBR(ctx.previousPaymentDate)}) e ainda em {String(ctx.referenceMonth).padStart(2, "0")}/{ctx.referenceYear} — valor mensal × ({BASIC_BASKET_CALCULATION_DAYS} − dia da admissão + 1) ÷ {BASIC_BASKET_CALCULATION_DAYS}. Base financeira fixa de {BASIC_BASKET_CALCULATION_DAYS} dias em todos os meses (dia 31 conta como dia {BASIC_BASKET_CALCULATION_DAYS}); o calendário segue o mês real.</p>
                  </Disclosure>
                )}
              </div>
            </div>
          </Card>

          <Card className="grid gap-4">
            <CardHeader titleAs="h3" title="Colaboradores" description="Empresa e valores começam com o padrão de cada colaborador; tudo continua editável por linha." />
            <CollaboratorMultiCombobox value={selectedIds} options={collaborators} onChange={changeSelection} />
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-end gap-3 rounded-control border border-border bg-surface-muted p-3" role="group" aria-label="Aplicar a todos os selecionados">
                <datalist id="cesta-companies">{companies.map((company) => <option key={company.id} value={companyLabel(company)} />)}</datalist>
                <Field label="Empresa para todos os selecionados" className="min-w-56 flex-1">{(control) => <input {...control} list="cesta-companies" className={textInputClassName} value={bulkCompany} onChange={(event) => applyCompany(event.target.value)} placeholder="Digite para buscar" />}</Field>
                <Button variant="secondary" onClick={() => setCompanyModal(true)}>Cadastrar empresa</Button>
                <Field label="Valor mensal da Cesta (R$)" className="w-44">{(control) => <CurrencyInput {...control} value={currencyValue(bulkBasket)} onValueChange={(value) => setBulkBasket(currencyText(value))} />}</Field>
                <Button variant="secondary" disabled={!bulkBasket.trim()} onClick={applyBulkBasket}>Aplicar aos selecionados</Button>
              </div>
            )}
          </Card>

          {selectedIds.length > 0 && (
            <Card>
              <BasicBasketPointMirror
                description={<>Falta Injustificada (Jornada Considerada = “Falta” e Eventos = “FALTA INJUSTIFICADA”) no MÊS ANTERIOR à competência (mês de apuração, do dia 01 ao último dia) corta integralmente a Cesta da competência; Faltas do próprio mês contam para a próxima competência. Férias (Eventos = “Férias”) reduzem os dias de direito (base {BASIC_BASKET_CALCULATION_DAYS}): as do mês da competência na Cesta, as do mês anterior só no Retroativo. Nada muda antes de aplicar.</>}
                file={pointFile}
                busy={pointBusy}
                preview={pointPreview}
                stale={Boolean(pointPreview && pointPreview.competence !== competence)}
                appliedCount={activeApplied ? Object.keys(activeApplied.byEmployee).length : null}
                appliedIsCurrent={Boolean(activeApplied && pointPreview && activeApplied.importId === pointPreview.importId)}
                applyLabel="Aplicar Faltas e Férias"
                statusText={pointStatusText}
                compare={comparePointMirror}
                onSelect={(file) => { setPointFile(file); setPointPreview(null); }}
                onClearFile={() => { setPointFile(null); setPointPreview(null); }}
                onProcess={processPointMirror}
                onApply={applyPointMirror}
                onReset={() => { setPointFile(null); setPointPreview(null); }}
                onRemoveAdjustments={() => setApplied(null)}
              />
            </Card>
          )}

          {missingAdmission > 0 && <FeedbackAlert status="error" title="Data de Admissão obrigatória">{MISSING_ADMISSION} {missingAdmission === 1 ? "1 colaborador selecionado está" : `${missingAdmission} colaboradores selecionados estão`} sem Data de Admissão (atualize o cadastro de colaboradores).</FeedbackAlert>}

          {fillRows.length > 0 && (
            <DataTable
              caption="Colaboradores da competência"
              columns={fillColumns}
              rows={fillRows}
              getRowId={(row) => row.id}
              minWidth="1360px"
              footer={<p className="text-body tabular-nums">Prévia do Total Geral: <strong className="text-primary">{moneyCents(previewTotal)}</strong> · {people(selectedIds.length)} · o servidor recalcula Cesta paga, Retroativo e Total ao salvar.</p>}
            />
          )}

          <Card className="grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_auto] md:items-end">
            <Field label="Fornecedor" required>{(control) => <select {...control} className={textInputClassName} value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select>}</Field>
            <CalculatedValue label="Prévia do Total Geral" value={moneyCents(previewTotal)} helper={`${people(selectedIds.length)} · recalculado pelo servidor ao salvar`} size="lg" live />
            <div className="grid gap-1.5 md:justify-items-end">
              <Button type="submit" disabled={busy || !canSave} loading={busy} aura={canSave} className="w-full md:w-auto md:min-w-56">Salvar / Gerar Rateio</Button>
              {hint && <p className="text-caption text-foreground-muted">{hint}</p>}
            </div>
            {error && <FeedbackAlert status="error" className="md:col-span-3">{error}</FeedbackAlert>}
          </Card>
        </form>
      </TabPanel>

      <TabPanel value="rateio" className="mt-4">
        <BasicBasketAllocationView maps={maps} monthLabel={monthLabel} onCorrect={(map, row) => setCorrecting({ map, row })} onCancel={(mapId) => setDeleteTarget({ mapId })} onFlash={downloadFlash} flashBusy={flashBusy} />
      </TabPanel>

      <TabPanel value="resumo" className="mt-4">
        <BasicBasketSummaryView summary={summary} difference={difference} />
      </TabPanel>
    </Tabs>

    <CorrectionModal target={correcting} companies={companies} onClose={() => setCorrecting(null)} onSaved={reload} />
    <CompanyModal open={companyModal} onClose={() => setCompanyModal(false)} onCreated={(company) => setCompanies((current) => [...current, company].sort((a, b) => comparePtBr(companyLabel(a), companyLabel(b))))} />
    <DeletionModal open={deleteTarget !== null} title="Cancelar todo o lançamento?" description="O lançamento e a obrigação serão cancelados." count={1} requireKeyword busy={deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={confirmDelete} />
    {deleteError && <FeedbackAlert status="error">{deleteError}</FeedbackAlert>}
  </div>;
}
