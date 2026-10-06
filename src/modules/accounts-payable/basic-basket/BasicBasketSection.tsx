"use client";
/* eslint-disable react-hooks/set-state-in-effect -- competence/target changes load a persisted server snapshot */
// Subseção "Cesta Básica" de Despesas → Alimentação. Mesma experiência do Café da Manhã
// (Preenchimento → Rateio → Resumo, empresa por colaborador, correção com histórico, XLSX), com domínio
// próprio (BasicBasket*). Calendário só visual (sem dias úteis); pagamento = 2ª quarta-feira. O valor informado
// é a Cesta MENSAL cheia; a Cesta paga (proporcional à admissão na competência) e o Retroativo (mês anterior)
// são prévias — o servidor recalcula tudo pela Data de Admissão do cadastro.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AllocationCard, AllocationDepartmentAccordion, AllocationDepartmentList } from "@/components/allocation/AllocationCard";
import { CompanyModal, companyLabel, normalizeText as normalize, type Company } from "@/components/allocation/CompanyPicker";
import { Badge, Button, DeletionModal, EmptyState, FileInput, MetricCard, buttonClassName, useToast } from "@/components/ui";
import { type CollaboratorOption } from "@/components/CollaboratorCombobox";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { ManualEntrySection } from "@/components/ManualEntryLayout";
import { buildCompetenceCalendar } from "@/modules/shared/calendar";
import { formatDateOnlyBR } from "@/lib/date-only";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { BASIC_BASKET_CALCULATION_DAYS, calculateBasicBasketLine, NO_BASIC_BASKET_ADJUSTMENTS, parseMoneyToCents, type BasicBasketAdjustments, type BasicBasketHoliday, type CurrentBasketStatus, type RetroactiveStatus } from "./calculations";
import { groupBasicBasketByCompanyCostCenter, groupBasicBasketByCompanyDepartment } from "./rateio";

// Espelho de Ponto (Falta Injustificada / Férias): prévia vinda do servidor. "Aplicar" só guarda o id da importação
// e os ajustes para a PRÉVIA da tela; ao salvar, o servidor relê a importação e recalcula tudo.
type PointMirrorStatus = "ABSENCE" | "VACATION" | "NEXT_COMPETENCE" | "BEFORE_ADMISSION" | "NO_OCCURRENCE" | "OUT_OF_PERIOD" | "NOT_SELECTED" | "NOT_ELIGIBLE" | "NOT_FOUND" | "INVALID_CPF" | "NOT_IN_FILE" | "MISSING_ADMISSION";
type PointMirrorPerson = { employeeId: string | null; employeeName: string; department: string | null; cpfMasked: string; status: PointMirrorStatus; apurationAbsence: string; nextCompetenceAbsence: string; beforeAdmissionAbsence: string; beforeAdmissionVacation: string; vacationBlocks: Array<{ month: "current" | "reference"; label: string; financialDays: number; extended: boolean; isolatedLastDay: boolean }>; outOfPeriodRows: number; currentVacation: string; referenceVacation: string; currentVacationDates: number; referenceVacationDates: number; absenceEventWithoutJourney: number; duplicateVacationRows: number; currentBasketDays: number; retroactiveDays: number; adjustments: BasicBasketAdjustments | null };
type PointMirrorPreview = { importId: string; reference: { current: string; previous: string; absence: string; absenceStart: string; absenceEnd: string }; totals: Record<string, number>; people: PointMirrorPerson[] };
type AppliedPointMirror = { importId: string; competence: string; byEmployee: Record<string, BasicBasketAdjustments> };
const POINT_STATUS_LABEL: Record<PointMirrorStatus, string> = { ABSENCE: "Cesta cortada — Falta Injustificada", VACATION: "Férias", NEXT_COMPETENCE: "Afeta a próxima competência", BEFORE_ADMISSION: "Ocorrência anterior à admissão — ignorada", NO_OCCURRENCE: "Sem ajuste", OUT_OF_PERIOD: "Fora do período de apuração", NOT_SELECTED: "Encontrado no arquivo, mas não selecionado", NOT_ELIGIBLE: "Inativo/mesclado — não aplicado", NOT_FOUND: "Não localizado (CPF)", INVALID_CPF: "CPF inválido", NOT_IN_FILE: "Selecionado, não está no arquivo — sem ajuste", MISSING_ADMISSION: "Sem Data de Admissão — não aplicado" };
const pointStatusText = (person: PointMirrorPerson) => {
  const a = person.adjustments;
  if (person.status === "ABSENCE" && a) return [a.currentUnjustifiedAbsence ? "Cesta cortada — Falta Injustificada" : "", a.retroactiveUnjustifiedAbsence ? "Retroativo cortado — Falta Injustificada no mês do Retroativo" : ""].filter(Boolean).join(" · ");
  if (person.status === "VACATION" && a) return [a.currentVacationDays ? `Férias — ${a.currentVacationDays} dias` : "", a.retroactiveVacationDays ? `Férias no Retroativo — ${a.retroactiveVacationDays} dias` : ""].filter(Boolean).join(" · ");
  return POINT_STATUS_LABEL[person.status];
};
// Texto curto do ajuste na célula (Cesta ou Retroativo); vazio quando não há ajuste.
const adjustmentNote = (absence: boolean, vacationDays: number, payableDays: number, absenceLabel = "Cortada — Falta Injustificada") => (absence ? absenceLabel : vacationDays ? `Férias: ${vacationDays} dias · ${payableDays}/${BASIC_BASKET_CALCULATION_DAYS} pagos` : "");

type Entity = { id: string; cnpj: string | null; tradeName: string; legalName: string; activityArea: string; locality: string };
type Person = { employeeId: string; currentStatus: CurrentBasketStatus; currentBasketDays: number; retroactiveStatus: RetroactiveStatus; retroactiveDays: number; admissionDate?: string };
type Context = { year: number; month: number; daysInMonth: number; previousPaymentDate: string; paymentDate: string; currentMonthStart: string; currentMonthEnd: string; calculationDays: number; referenceYear: number; referenceMonth: number; referenceMonthStart: string; referenceMonthEnd: string; holidays: BasicBasketHoliday[]; people: Person[] };
type Allocation = {
  id: string; employeeId: string | null; employeeName: string; company: string; companyId: string | null; department: string | null; costCenter: string | null;
  admissionDate: string | null; referenceCalculationDays: number; retroactiveDays: number; retroactiveEligible: boolean; driverBonus: string; agreementAmount: string;
  monthlyBasketAmount: string; currentCalculationDays: number; currentBasketDays: number; basketAmount: string; retroactiveAmount: string; amount: string; observation: string | null;
  currentVacationDays: number; currentUnjustifiedAbsence: boolean; currentPayableDays: number; retroactiveVacationDays: number; retroactiveUnjustifiedAbsence: boolean; retroactivePayableDays: number; pointMirrorImportId: string | null;
};
const snapshotAdjustments = (row: Allocation): BasicBasketAdjustments => ({ currentVacationDays: row.currentVacationDays, currentUnjustifiedAbsence: row.currentUnjustifiedAbsence, retroactiveVacationDays: row.retroactiveVacationDays, retroactiveUnjustifiedAbsence: row.retroactiveUnjustifiedAbsence });
type MapData = { id: string; version: number; previousPaymentDate: string; paymentDate: string; daysInMonth: number; totalAmount: string; administrativeEntity: Entity; financialRecord: { identifier: string; grossAmount: string } | null; allocations: Allocation[] };
type Config = { companyId: string | null; driverBonus: string; agreementAmount: string; basketAmount: string };
type EntryValue = { companyText: string; companyId: string; driverBonus: string; agreement: string; basket: string; observation: string };

const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const moneyCents = (cents: number) => money(cents / 100);
const toInput = (decimal: string | undefined) => (decimal && Number(decimal) ? Number(decimal).toFixed(2).replace(".", ",") : "0,00");
const people = (count: number) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`;
const MISSING_ADMISSION = "Informe a Data de Admissão do colaborador para calcular a Cesta Básica.";
const SOURCE_LABEL = { NATIONAL: "Feriado nacional", TRANSIT_VOUCHER: "Feriado manual (Vale Transporte)", BREAKFAST: "Feriado manual (Café da Manhã)" } as const;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// Fornecedores do domínio Alimentação (mesmo critério do Café da Manhã, sem nome fixo) + área "Cesta".
const matchesActivity = (activityArea: string) => { const value = normalize(activityArea); return value.includes("alimenta") || value.includes("cesta"); };
// Rótulo curto do Retroativo na tabela ("10 de 30 dias" ou o motivo de não haver Retroativo).
const retroLabel = (status: RetroactiveStatus, days: number, monthDays: number) => (status === "PRORATED" ? `${days} de ${monthDays} dias` : status === "MISSING_ADMISSION" ? "Sem admissão" : status === "CURRENT_OR_LATER" ? "Admissão na competência atual" : "Sem retroativo");
// Tooltip: o Retroativo compensa só o MÊS ANTERIOR (admitidos depois do pagamento anterior e ainda naquele mês).
const retroDetail = (status: RetroactiveStatus, info: { admissionDate?: string | null; previousPaymentDate: string; referenceMonthEnd: string; days: number; monthDays: number; cents: number }) =>
  status === "MISSING_ADMISSION" ? "Data de Admissão não cadastrada."
    : status === "CURRENT_OR_LATER" ? "Admissão na competência atual (ou depois do mês de referência): sem Retroativo; a Cesta desta competência já considera a proporcionalidade."
    : status === "NONE" ? `Admitido até o pagamento anterior (${formatDateOnlyBR(info.previousPaymentDate)}): o mês anterior já foi pago, sem Retroativo.`
    : `Admissão: ${formatDateOnlyBR(info.admissionDate)} · Pagamento anterior: ${formatDateOnlyBR(info.previousPaymentDate)} · Período retroativo: ${formatDateOnlyBR(info.admissionDate)} a ${formatDateOnlyBR(info.referenceMonthEnd)} · Dias: ${info.days} de ${info.monthDays} · Valor: ${moneyCents(info.cents)}`;

// Situação da Cesta da competência (abaixo do valor mensal): dias de direito e valor a pagar.
const basketLabel = (status: CurrentBasketStatus, days: number, monthDays: number, payableCents: number) => (status === "FULL_MONTH" ? `Mês completo · ${days} de ${monthDays} dias` : status === "PRORATED" ? `${days} de ${monthDays} dias · A pagar: ${moneyCents(payableCents)}` : status === "AFTER_PAYMENT" ? "R$ 0,00 a pagar — Receberá na próxima competência" : "Sem Data de Admissão");
const basketDetail = (status: CurrentBasketStatus, info: { admissionDate?: string | null; paymentDate: string; currentMonthEnd: string; days: number; monthDays: number }) =>
  status === "FULL_MONTH" ? "Admitido até o 1º dia da competência: Cesta do mês completo."
    : status === "PRORATED" ? `Admissão: ${formatDateOnlyBR(info.admissionDate)} · ${info.days} de ${info.monthDays} dias (base comercial: ${BASIC_BASKET_CALCULATION_DAYS} − dia da admissão + 1)`
    : status === "AFTER_PAYMENT" ? `Admissão (${formatDateOnlyBR(info.admissionDate)}) após o pagamento (${formatDateOnlyBR(info.paymentDate)}): receberá a Cesta e o Retroativo na próxima competência.` : MISSING_ADMISSION;

// Calendário SOMENTE LEITURA (sem cadastro/edição de feriado): feriados de todas as fontes e o pagamento em destaque.
function BasketCalendar({ year, month, holidays, paymentDate }: { year: number; month: number; holidays: BasicBasketHoliday[]; paymentDate: string }) {
  const byDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  const days = buildCompetenceCalendar(year, month, holidays.map((holiday) => holiday.date));
  return <div>
    <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-secondary" aria-hidden="true">{WEEKDAYS.map((label) => <span key={label}>{label}</span>)}</div>
    <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Calendário da competência (somente leitura)">
      {Array.from({ length: days[0]?.weekday ?? 0 }, (_, index) => <span key={`blank-${index}`} />)}
      {days.map((day) => { const holiday = byDate.get(day.date); const payment = day.date === paymentDate; const title = [payment ? "Pagamento da Cesta Básica" : "", holiday ? `${holiday.names.join(" / ")} — ${holiday.sources.map((source) => SOURCE_LABEL[source]).join(", ")}` : "", day.weekend ? "Final de semana" : ""].filter(Boolean).join(" · ") || "Dia comum";
        return <div key={day.date} role="gridcell" title={title} aria-label={`${day.day}: ${title}`} className={`flex h-10 flex-col items-center justify-center rounded-md border text-sm ${holiday ? "border-emerald-500 bg-emerald-100 font-bold text-emerald-900" : day.weekend ? "border-orange-200 bg-orange-50 text-orange-900" : "border-base-300 bg-base-100"} ${payment ? "ring-2 ring-primary ring-offset-1" : ""}`}>{day.day}{payment && <span className="text-[9px] font-semibold leading-none text-primary">PGTO</span>}</div>; })}
    </div>
    <ul className="mt-3 flex flex-wrap gap-4 text-xs text-secondary" aria-label="Legenda">
      <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-orange-200 bg-orange-50" />Final de semana</li>
      <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-emerald-500 bg-emerald-100" />Feriado</li>
      <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-base-300 ring-2 ring-primary" />Pagamento da Cesta Básica</li>
    </ul>
  </div>;
}

function CorrectionModal({ target, companies, onClose, onSaved }: { target: { map: MapData; row: Allocation } | null; companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ companyText: "", driverBonus: "", agreement: "", basket: "", observation: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current; if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
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
  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose}>
      <form onSubmit={submit} className="modal-box max-w-lg border border-base-300 bg-base-100">
        <h2 className="text-lg font-bold text-neutral">Corrigir lançamento</h2>
        <p className="mt-1 text-sm text-secondary">{target?.row.employeeName} · o registro atual é cancelado (com histórico) e um novo é gerado. Data de Admissão e ciclo de pagamento usados no lançamento são preservados; Cesta paga, Retroativo e Total são recalculados a partir do valor mensal.</p>
        {target && <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-base-300 bg-base-200/60 p-3 text-xs sm:grid-cols-4" aria-label="Base histórica preservada"><div><dt className="text-secondary">Pagamentos</dt><dd className="font-semibold">{formatDateOnlyBR(target.map.previousPaymentDate)} → {formatDateOnlyBR(target.map.paymentDate)}</dd></div><div><dt className="text-secondary">Admissão usada</dt><dd className="font-semibold">{formatDateOnlyBR(target.row.admissionDate) || "—"}</dd></div><div><dt className="text-secondary">Dias de direito à Cesta</dt><dd className="font-semibold">{target.row.currentBasketDays} de {target.row.currentCalculationDays}</dd></div><div><dt className="text-secondary">Dias retroativos</dt><dd className="font-semibold">{target.row.retroactiveDays ? `${target.row.retroactiveDays} de ${target.row.referenceCalculationDays}` : "Sem retroativo"}</dd></div><div><dt className="text-secondary">Departamento</dt><dd className="font-semibold">{target.row.department ?? "—"}</dd></div><div className="col-span-2 sm:col-span-4"><dt className="text-secondary">Espelho de Ponto (preservado)</dt><dd className="font-semibold">{[adjustmentNote(target.row.currentUnjustifiedAbsence, target.row.currentVacationDays, target.row.currentPayableDays) && `Cesta: ${adjustmentNote(target.row.currentUnjustifiedAbsence, target.row.currentVacationDays, target.row.currentPayableDays)}`, adjustmentNote(target.row.retroactiveUnjustifiedAbsence, target.row.retroactiveVacationDays, target.row.retroactivePayableDays) && `Retroativo: ${adjustmentNote(target.row.retroactiveUnjustifiedAbsence, target.row.retroactiveVacationDays, target.row.retroactivePayableDays)}`].filter(Boolean).join(" · ") || "Sem Falta Injustificada nem Férias"}</dd></div></dl>}
        {error && <p className="mt-3 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="form-control sm:col-span-3"><span className="label-text mb-1">Empresa</span><input list="cesta-companies-correction" className="input input-bordered w-full" value={form.companyText} onChange={(event) => setForm({ ...form, companyText: event.target.value })} /><datalist id="cesta-companies-correction">{companies.map((item) => <option key={item.id} value={companyLabel(item)} />)}</datalist></label>
          <label className="form-control"><span className="label-text mb-1">Bonificação Condutor</span><input inputMode="decimal" className="input input-bordered w-full text-right" value={form.driverBonus} onChange={(event) => setForm({ ...form, driverBonus: event.target.value })} /></label>
          <label className="form-control"><span className="label-text mb-1">Acordo</span><input inputMode="decimal" className="input input-bordered w-full text-right" value={form.agreement} onChange={(event) => setForm({ ...form, agreement: event.target.value })} /></label>
          <label className="form-control"><span className="label-text mb-1">Valor mensal da Cesta</span><input inputMode="decimal" className="input input-bordered w-full text-right" value={form.basket} onChange={(event) => setForm({ ...form, basket: event.target.value })} /></label>
          <p className="text-sm sm:col-span-3">Cesta paga: <strong>{preview ? moneyCents(preview.payableBasketCents) : "—"}</strong> · Retroativo: <strong>{preview ? moneyCents(preview.retroactiveCents) : "—"}</strong> · Total: <strong className="text-primary">{preview ? moneyCents(preview.totalCents) : "—"}</strong></p>
          <label className="form-control sm:col-span-3"><span className="label-text mb-1">Observação</span><input maxLength={500} className="input input-bordered w-full" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} /></label>
          <label className="form-control sm:col-span-3"><span className="label-text mb-1">Motivo da correção *</span><input required className="input input-bordered w-full" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        </div>
        <div className="modal-action"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" loading={busy} disabled={busy || !form.reason.trim()}>Salvar correção</Button></div>
      </form>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fechar">Fechar</button></form>
    </dialog>
  );
}

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
  async function confirmDelete(reason: string) {
    if (!deleteTarget) return; setDeleting(true); setDeleteError(null);
    try { await post(`/api/accounts-payable/basic-basket/${deleteTarget.mapId}`, "DELETE", { reason, confirmation: "EXCLUIR" }); setDeleteTarget(null); await reload(); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Não foi possível excluir."); } finally { setDeleting(false); }
  }

  const all = maps.flatMap((map) => map.allocations);
  const summary = useMemo(() => groupBasicBasketByCompanyCostCenter(all), [all]);
  const mapsTotalCents = maps.reduce((sum, map) => sum + Math.round(Number(map.totalAmount) * 100), 0);
  const difference = summary.totals.totalCents - mapsTotalCents;
  const tabButton = (id: typeof tab, label: string) => <Button type="button" role="tab" aria-selected={tab === id} variant={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>{label}</Button>;
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  const moneyInput = (id: string, key: "driverBonus" | "agreement" | "basket", label: string, name?: string) => <input aria-label={`${label}${name ? ` de ${name}` : ""}`} inputMode="decimal" className="input input-bordered input-sm w-28 text-right tabular-nums" value={values[id]?.[key] ?? ""} onChange={(event) => patchValue(id, { [key]: event.target.value })} />;

  return <div className="grid gap-6">
    <div className="rounded-lg border border-base-300 bg-base-100 p-1"><div role="tablist" aria-label="Etapas da Cesta Básica" className="grid grid-cols-3 gap-1">{tabButton("preenchimento", "Preenchimento")}{tabButton("rateio", "Rateio")}{tabButton("resumo", "Resumo")}</div></div>

    {tab === "preenchimento" && <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-5" role="tabpanel">
      <ManualEntrySection eyebrow="1. Competência" title="Competência, calendário e pagamento">
        <label className="form-control max-w-sm"><span className="label-text mb-1">Competência *</span><input type="month" className="input input-bordered w-full" value={competence} onChange={(event) => { setCompetence(event.target.value); setPointPreview(null); setApplied(null); }} /></label>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div>{ctx ? <BasketCalendar year={year} month={month} holidays={ctx.holidays} paymentDate={ctx.paymentDate} /> : <p className="text-sm text-secondary">Carregando calendário…</p>}<p className="mt-2 text-xs text-secondary">Calendário somente leitura: feriados nacionais automáticos e os feriados manuais já cadastrados no Vale Transporte e no Café da Manhã (para editá-los, use o módulo de origem).</p></div>
          <div className="grid content-start gap-3">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Competência" value={monthLabel} />
              <MetricCard label="Dias no mês" value={String(ctx?.daysInMonth ?? "—")} description={`Base de cálculo da Cesta: ${BASIC_BASKET_CALCULATION_DAYS} dias`} />
              <MetricCard label="Pagamento" value={ctx ? formatDateOnlyBR(ctx.paymentDate) : "—"} description={ctx ? `2ª quarta-feira · anterior ${formatDateOnlyBR(ctx.previousPaymentDate)}` : "2ª quarta-feira da competência"} accent />
              <MetricCard label="Feriados" value={String(ctx?.holidays.length ?? "—")} />
            </div>
            <div className="rounded-lg border border-base-300 p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Feriados da competência</span>
              {ctx?.holidays.length ? <ul className="mt-2 grid gap-1 text-sm">{ctx.holidays.map((holiday) => <li key={holiday.date}><strong>{holiday.date.slice(8, 10)}/{holiday.date.slice(5, 7)}</strong> — {holiday.names.join(" / ")}<span className="ml-2 text-xs text-secondary">{holiday.sources.map((source) => SOURCE_LABEL[source]).join(" · ")}</span></li>)}</ul> : <p className="mt-1 text-sm text-secondary">Nenhum feriado na competência.</p>}
            </div>
            {ctx && <p className="text-xs text-secondary">Cesta da competência: mês completo para admitidos até {formatDateOnlyBR(ctx.currentMonthStart)}; admitidos até o pagamento ({formatDateOnlyBR(ctx.paymentDate)}) recebem valor mensal × ({BASIC_BASKET_CALCULATION_DAYS} − dia da admissão + 1) ÷ {BASIC_BASKET_CALCULATION_DAYS}; admitidos depois recebem na próxima competência. Retroativo: só para admitidos depois do pagamento anterior ({formatDateOnlyBR(ctx.previousPaymentDate)}) e ainda em {String(ctx.referenceMonth).padStart(2, "0")}/{ctx.referenceYear} — valor mensal × ({BASIC_BASKET_CALCULATION_DAYS} − dia da admissão + 1) ÷ {BASIC_BASKET_CALCULATION_DAYS}. Base financeira fixa de {BASIC_BASKET_CALCULATION_DAYS} dias em todos os meses (dia 31 conta como dia {BASIC_BASKET_CALCULATION_DAYS}); o calendário segue o mês real.</p>}
          </div>
        </div>
      </ManualEntrySection>

      <ManualEntrySection eyebrow="2. Pessoas" title="Colaboradores">
        <CollaboratorMultiCombobox value={selectedIds} options={collaborators} onChange={changeSelection} />
        {selectedIds.length > 0 && <>
          <datalist id="cesta-companies">{companies.map((company) => <option key={company.id} value={companyLabel(company)} />)}</datalist>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="form-control min-w-56 flex-1"><span className="label-text mb-1">Empresa para todos os selecionados</span><input list="cesta-companies" className="input input-bordered w-full" value={bulkCompany} onChange={(event) => applyCompany(event.target.value)} placeholder="Digite para buscar" /></label>
            <Button type="button" variant="secondary" onClick={() => setCompanyModal(true)}>Cadastrar empresa</Button>
            <label className="form-control w-40"><span className="label-text mb-1">Valor mensal da Cesta</span><input inputMode="decimal" className="input input-bordered w-full text-right" value={bulkBasket} onChange={(event) => setBulkBasket(event.target.value)} placeholder="R$ 0,00" /></label>
            <Button type="button" variant="secondary" disabled={!bulkBasket.trim()} onClick={applyBulkBasket}>Aplicar aos selecionados</Button>
          </div>
          <div className="mt-4 rounded-lg border border-base-300 p-3" aria-label="Importar Espelho de Ponto">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1"><span className="label-text mb-1 block">Importar Espelho de Ponto — Faltas e Férias (opcional)</span><FileInput accept=".xlsx,.csv" fileName={pointFile?.name ?? ""} loading={pointBusy} aria-label="Selecionar Espelho de Ponto" onChange={(event) => { setPointFile(event.target.files?.[0] ?? null); setPointPreview(null); }} /></div>
              <Button type="button" variant="secondary" disabled={!pointFile || pointBusy} loading={pointBusy} onClick={processPointMirror}>Processar arquivo</Button>
            </div>
            <p className="mt-2 text-xs text-secondary">Falta Injustificada (Jornada Considerada = “Falta” e Eventos = “FALTA INJUSTIFICADA”) no MÊS ANTERIOR à competência (mês de apuração, do dia 01 ao último dia) corta integralmente a Cesta da competência; Faltas do próprio mês contam para a próxima competência. Férias (Eventos = “Férias”) reduzem os dias de direito (base {BASIC_BASKET_CALCULATION_DAYS}): as do mês da competência na Cesta, as do mês anterior só no Retroativo. Identificação somente por CPF. Nada muda antes de aplicar, e o arquivo não é armazenado.</p>
            {activeApplied && <p role="status" className="mt-2 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs">Faltas e Férias aplicadas à prévia ({Object.keys(activeApplied.byEmployee).length} colaborador(es)). Uma nova aplicação substitui esta. <button type="button" className="font-semibold text-primary" onClick={() => setApplied(null)}>Remover ajustes</button></p>}
            {pointPreview && (() => {
              const t = pointPreview.totals; const stale = pointPreview.competence !== competence;
              const compare = (person: PointMirrorPerson) => {
                const value = person.employeeId ? values[person.employeeId] : undefined; const row = person.employeeId ? preview.find((item) => item.id === person.employeeId) : undefined;
                if (!value || !row || !person.adjustments) return null;
                try {
                  const input = { driverBonusCents: parseMoneyToCents(value.driverBonus, "Bonificação"), agreementCents: parseMoneyToCents(value.agreement, "Acordo"), monthlyBasketCents: parseMoneyToCents(value.basket, "Cesta"), currentBasketDays: row.currentBasketDays, retroactiveDays: row.retroactiveDays };
                  return { before: calculateBasicBasketLine(input), after: calculateBasicBasketLine({ ...input, adjustments: person.adjustments }) };
                } catch { return null; }
              };
              return <div className="mt-3 grid gap-3">
                <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">{([["Linhas analisadas", t.rows], ["Colaboradores encontrados", t.located], ["Cesta cortada por Falta Injustificada", t.absence], ["Colaboradores com Férias", t.vacation], ["Sem ocorrência", t.noOccurrence + t.notInFile], ["Afeta a próxima competência", t.nextCompetence], ["Anterior à admissão (ignorada)", t.beforeAdmission], ["Fora do período de apuração", t.outOfPeriod], ["Não localizados", t.notFound], ["CPF inválido", t.invalidCpfPeople]] as const).map(([label, value]) => <div key={label} className="rounded-md bg-base-200 p-2"><dt className="text-secondary">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
                <p className="text-xs text-secondary">Competência {pointPreview.reference.current} · mês de apuração das Faltas {pointPreview.reference.absence} ({formatDateOnlyBR(pointPreview.reference.absenceStart)} a {formatDateOnlyBR(pointPreview.reference.absenceEnd)}) · Retroativo/Férias do mês anterior {pointPreview.reference.previous}{t.duplicateVacationRows ? ` · ${t.duplicateVacationRows} linha(s) de Férias repetida(s) desconsiderada(s)` : ""}{t.notSelected ? ` · ${t.notSelected} encontrado(s) no arquivo, mas não selecionado(s)` : ""}.</p>
                {t.isolatedLastDayVacation > 0 && <p className="text-xs text-warning">{t.isolatedLastDayVacation} colaborador(es) com Férias registradas apenas no último dia do mês. Não foi inferida continuidade até o dia comercial {BASIC_BASKET_CALCULATION_DAYS}.</p>}
                {t.absenceEventWithoutJourney > 0 && <p className="text-xs text-warning">{t.absenceEventWithoutJourney} linha(s) com Eventos = “FALTA INJUSTIFICADA” sem Jornada Considerada = “Falta”: não cortam a Cesta (a regra exige as duas condições). Confira o arquivo.</p>}
                {stale && <p role="alert" className="text-xs text-warning">A competência mudou depois do processamento; processe o arquivo novamente.</p>}
                <div className="max-h-96 overflow-auto rounded-lg border border-base-300">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="sticky top-0 bg-base-200 text-left text-xs"><tr><th className="p-2">Colaborador</th><th className="p-2">CPF</th><th className="p-2">Departamento</th><th className="p-2">Situação</th><th className="p-2">Faltas Injustificadas</th><th className="p-2">Férias</th><th className="p-2 text-center">Dias antes</th><th className="p-2 text-center">Dias depois</th><th className="p-2 text-right">Valor antes</th><th className="p-2 text-right">Valor depois</th></tr></thead>
                    <tbody>{[...pointPreview.people].sort((a, b) => Number(Boolean(b.adjustments)) - Number(Boolean(a.adjustments)) || comparePtBr(a.employeeName, b.employeeName)).map((person, index) => { const result = compare(person); const hasRetro = person.retroactiveDays > 0; return <tr key={`${person.employeeId ?? person.cpfMasked}-${index}`} className="border-t border-border align-top">
                      <td className="p-2 font-medium">{person.employeeName}</td><td className="p-2 text-xs tabular-nums text-secondary">{person.cpfMasked || "—"}</td><td className="p-2 text-xs">{person.department ?? "—"}</td>
                      <td className={`p-2 text-xs ${person.status === "ABSENCE" ? "font-semibold text-error" : person.status === "VACATION" ? "text-success" : person.status === "NEXT_COMPETENCE" ? "text-warning" : "text-secondary"}`} title={person.adjustments?.currentUnjustifiedAbsence ? `Falta em ${person.apurationAbsence}/${pointPreview.reference.absence.slice(3)}, dentro do mês de apuração da Cesta de ${pointPreview.reference.current}.` : person.status === "NEXT_COMPETENCE" ? `Falta em ${person.nextCompetenceAbsence}/${pointPreview.reference.current.slice(3)}: será considerada na apuração da próxima competência.` : undefined}>{pointStatusText(person)}{person.adjustments?.currentUnjustifiedAbsence && <span className="block font-normal text-secondary">Falta em {person.apurationAbsence} — mês de apuração {pointPreview.reference.absence}</span>}{person.status !== "NEXT_COMPETENCE" && person.nextCompetenceAbsence && <span className="block font-normal text-warning">Falta em {person.nextCompetenceAbsence}: afeta a próxima competência</span>}</td>
                      <td className="p-2 text-xs">{[person.apurationAbsence && `Apuração ${pointPreview.reference.absence}: ${person.apurationAbsence}`, person.nextCompetenceAbsence && `Próxima competência: ${person.nextCompetenceAbsence}`].filter(Boolean).join(" · ") || (person.beforeAdmissionAbsence ? "" : "—")}{person.beforeAdmissionAbsence && <span className="block text-secondary line-through decoration-secondary/50" title="Ocorrência anterior à Data de Admissão: não afeta o benefício.">{person.beforeAdmissionAbsence} — anterior à admissão, ignorada</span>}</td>
                      <td className="p-2 text-xs">{person.vacationBlocks.length ? person.vacationBlocks.map((block, blockIndex) => <span key={`${block.month}-${blockIndex}`} className="block" title={block.extended ? `Período contínuo até o fim do mês. Para a Cesta Básica, a base financeira é de ${BASIC_BASKET_CALCULATION_DAYS} dias.` : undefined}>{block.month === "reference" ? `${pointPreview.reference.previous} (Retroativo): ` : ""}{block.label} · {block.financialDays} {block.financialDays === 1 ? "dia" : "dias financeiros"}{block.isolatedLastDay && <span className="block text-warning">Ocorrência isolada no último dia do mês; continuidade até o dia comercial {BASIC_BASKET_CALCULATION_DAYS} não inferida.</span>}</span>) : (person.beforeAdmissionVacation ? "" : "—")}{person.beforeAdmissionVacation && <span className="block text-secondary">{person.beforeAdmissionVacation} — Anterior à admissão — não reduz</span>}</td>
                      <td className="p-2 text-center text-xs tabular-nums">{person.adjustments ? `${person.currentBasketDays}/${BASIC_BASKET_CALCULATION_DAYS}${hasRetro ? ` · Retro ${person.retroactiveDays}` : ""}` : "—"}</td>
                      <td className="p-2 text-center text-xs font-semibold tabular-nums">{result ? `${result.after.currentPayableDays}/${BASIC_BASKET_CALCULATION_DAYS}${hasRetro ? ` · Retro ${result.after.retroactivePayableDays}` : ""}` : "—"}</td>
                      <td className="whitespace-nowrap p-2 text-right text-xs tabular-nums">{result ? moneyCents(result.before.totalCents) : "—"}</td>
                      <td className="whitespace-nowrap p-2 text-right text-xs font-semibold tabular-nums">{result ? moneyCents(result.after.totalCents) : "—"}</td>
                    </tr>; })}</tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2"><span className="text-xs text-secondary">Substitui (não soma) ajustes aplicados antes. Não salva o lançamento: confira a prévia e use “Salvar / Gerar Rateio”.</span><Button type="button" disabled={stale} onClick={applyPointMirror}>Aplicar Faltas e Férias</Button></div>
              </div>;
            })()}
          </div>
          {missingAdmission > 0 && <p role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/5 p-3 text-sm text-error">{MISSING_ADMISSION} {missingAdmission === 1 ? "1 colaborador selecionado está" : `${missingAdmission} colaboradores selecionados estão`} sem Data de Admissão (atualize o cadastro de colaboradores).</p>}
          <div className="mt-4 overflow-x-auto rounded-lg border border-base-300">
            <table className="w-full min-w-[1240px] text-sm">
              <thead><tr className="border-b border-border bg-base-200 text-left text-xs">
                <th className="p-2">Empresa</th><th className="p-2">Colaborador</th><th className="p-2">Departamento</th>
                <th className="w-32 p-2 text-right">Bonificação Condutor</th><th className="w-32 p-2 text-right">Acordo</th><th className="w-44 p-2 text-right">Cesta Básica (valor mensal)</th>
                <th className="w-28 p-2 text-right">Retroativo</th><th className="w-28 p-2 text-right">Total</th><th className="p-2">Observação</th>
              </tr></thead>
              <tbody>
                {preview.map((row) => { const value = values[row.id]; if (!value) return null; const unmatched = value.companyText.trim() && !value.companyId; const name = row.employee?.officialName; return <tr key={row.id} className="border-b border-border align-top last:border-0">
                  <td className="p-2"><input list="cesta-companies" aria-label={`Empresa de ${name}`} className={`input input-bordered input-sm w-40 ${unmatched || !value.companyId ? "input-warning" : ""}`} value={value.companyText} onChange={(event) => { const company = companyByText(event.target.value); patchValue(row.id, { companyText: event.target.value, companyId: company?.id ?? "" }); }} />{unmatched && <span className="mt-1 block text-xs text-warning">Selecione uma empresa cadastrada.</span>}</td>
                  <td className="p-2 font-medium">{name}</td>
                  <td className="p-2">{row.employee?.department}</td>
                  <td className="p-2 text-right">{moneyInput(row.id, "driverBonus", "Bonificação Condutor", name)}</td>
                  <td className="p-2 text-right">{moneyInput(row.id, "agreement", "Acordo", name)}</td>
                  <td className="p-2 text-right" title={ctx ? basketDetail(row.currentStatus, { admissionDate: row.admissionDate, paymentDate: ctx.paymentDate, currentMonthEnd: ctx.currentMonthEnd, days: row.currentBasketDays, monthDays: BASIC_BASKET_CALCULATION_DAYS }) : undefined}>{moneyInput(row.id, "basket", "Valor mensal da Cesta Básica", name)}<span className={`block text-[11px] ${row.currentStatus === "FULL_MONTH" ? "text-secondary" : row.currentStatus === "PRORATED" ? "text-success" : row.currentStatus === "AFTER_PAYMENT" ? "text-warning" : "text-error"}`}>{basketLabel(row.currentStatus, row.currentBasketDays, BASIC_BASKET_CALCULATION_DAYS, row.payableBasketCents)}</span>{adjustmentNote(row.adjustments.currentUnjustifiedAbsence, row.adjustments.currentVacationDays, row.currentPayableDays) && <span className={`block text-[11px] font-semibold ${row.adjustments.currentUnjustifiedAbsence ? "text-error" : "text-warning"}`}>{adjustmentNote(row.adjustments.currentUnjustifiedAbsence, row.adjustments.currentVacationDays, row.currentPayableDays, "Cesta cortada — Falta Injustificada no mês de apuração")} · A pagar: {moneyCents(row.payableBasketCents)}</span>}{row.notCovered && <span className="block text-[11px] text-warning">Fora da importação aplicada (sem ajuste)</span>}</td>
                  <td className="whitespace-nowrap p-2 text-right" title={ctx ? retroDetail(row.status, { admissionDate: row.admissionDate, previousPaymentDate: ctx.previousPaymentDate, referenceMonthEnd: ctx.referenceMonthEnd, days: row.retroactiveDays, monthDays: BASIC_BASKET_CALCULATION_DAYS, cents: row.retroactiveCents }) : undefined}><span className="tabular-nums">{moneyCents(row.retroactiveCents)}</span><span className={`block text-[11px] ${row.status === "PRORATED" ? "text-success" : row.status === "MISSING_ADMISSION" ? "text-warning" : "text-secondary"}`}>{retroLabel(row.status, row.retroactiveDays, BASIC_BASKET_CALCULATION_DAYS)}</span>{adjustmentNote(row.adjustments.retroactiveUnjustifiedAbsence, row.adjustments.retroactiveVacationDays, row.retroactivePayableDays) && <span className={`block text-[11px] font-semibold ${row.adjustments.retroactiveUnjustifiedAbsence ? "text-error" : "text-warning"}`}>{adjustmentNote(row.adjustments.retroactiveUnjustifiedAbsence, row.adjustments.retroactiveVacationDays, row.retroactivePayableDays)}</span>}</td>
                  <td className="whitespace-nowrap p-2 text-right font-semibold text-primary">{row.error ? <span className="text-xs font-normal text-error">{row.error}</span> : moneyCents(row.totalCents)}</td>
                  <td className="p-2"><input aria-label={`Observação de ${name}`} maxLength={500} className="input input-bordered input-sm w-48" value={value.observation} onChange={(event) => patchValue(row.id, { observation: event.target.value })} /></td>
                </tr>; })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">Prévia do Total Geral: <strong className="text-primary">{moneyCents(previewTotal)}</strong> · {people(selectedIds.length)} · o servidor recalcula Cesta paga, Retroativo e Total ao salvar.</p>
        </>}
      </ManualEntrySection>

      <ManualEntrySection eyebrow="3. Fornecedor" title="Cadastro da obrigação">
        <label className="form-control max-w-md"><span className="label-text mb-1">Fornecedor *</span><select required className="select select-bordered w-full" value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Selecionar cadastro</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select></label>
      </ManualEntrySection>

      {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
      <div className="flex flex-col gap-2 md:items-end"><Button type="submit" disabled={busy || !canSave} loading={busy} aura={canSave} className="w-full md:w-auto md:min-w-64">Salvar / Gerar Rateio</Button>{hint && <p className="text-xs text-secondary">{hint}</p>}</div>
    </form>}

    {tab === "rateio" && <section role="tabpanel" className="grid gap-4">
      {maps.length ? maps.map((map) => {
        const tree = groupBasicBasketByCompanyDepartment(map.allocations); const diff = tree.totals.totalCents - Math.round(Number(map.totalAmount) * 100);
        return <AllocationCard key={map.id} title={map.administrativeEntity.tradeName} subtitle={`competência ${monthLabel} · v${map.version}`} badge={<Badge tone="success">Concluído</Badge>}
          indicators={[{ label: "Empresas / departamentos", value: `${tree.companies.length} / ${tree.companies.reduce((sum, company) => sum + company.departments.length, 0)}` }, { label: "Colaboradores", value: tree.totals.people }, { label: "Pagamento · dias no mês", value: `${formatDateOnlyBR(map.paymentDate)} · ${map.daysInMonth}` }, { label: "Valor total · obrigação", value: `${money(map.totalAmount)}${map.financialRecord ? ` · ${map.financialRecord.identifier}` : ""}` }]}>
          <AllocationDepartmentList>{tree.companies.map((company) => <AllocationDepartmentAccordion key={company.company} name={company.company} summary={`${people(company.totals.people)} · ${moneyCents(company.totals.totalCents)}`}>
            <div className="grid gap-3">{company.departments.map((department) => <AllocationDepartmentAccordion key={department.department} name={department.department} summary={`${people(department.totals.people)} · ${moneyCents(department.totals.totalCents)}`}>
              <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-secondary"><th className="py-2 pr-2">Colaborador</th><th className="py-2 pr-2 text-right">Bonificação</th><th className="py-2 pr-2 text-right">Acordo</th><th className="py-2 pr-2 text-right">Cesta</th><th className="py-2 pr-2 text-right">Retroativo</th><th className="py-2 pr-2 text-right">Total</th><th className="py-2 pr-2">Observação</th><th /></tr></thead>
                <tbody>{department.rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="py-2 pr-2">{row.employeeName}</td><td className="whitespace-nowrap py-2 pr-2 text-right">{money(row.driverBonus)}</td><td className="whitespace-nowrap py-2 pr-2 text-right">{money(row.agreementAmount)}</td><td className="whitespace-nowrap py-2 pr-2 text-right" title={`Valor mensal ${money(row.monthlyBasketAmount)} · ${row.currentBasketDays} de ${row.currentCalculationDays} dias de direito`}>{money(row.basketAmount)}{adjustmentNote(row.currentUnjustifiedAbsence, row.currentVacationDays, row.currentPayableDays) ? <span className={`block text-[11px] ${row.currentUnjustifiedAbsence ? "text-error" : "text-secondary"}`} title={row.currentUnjustifiedAbsence ? "Cesta cortada devido à Falta Injustificada no mês de apuração (mês anterior à competência)." : undefined}>{adjustmentNote(row.currentUnjustifiedAbsence, row.currentVacationDays, row.currentPayableDays, "Cortada — Falta Injustificada (mês de apuração)")}</span> : row.currentBasketDays !== row.currentCalculationDays && <span className="block text-[11px] text-secondary">{row.currentBasketDays} de {row.currentCalculationDays} dias · mensal {money(row.monthlyBasketAmount)}</span>}</td><td className="whitespace-nowrap py-2 pr-2 text-right" title={row.retroactiveDays ? `Admissão ${formatDateOnlyBR(row.admissionDate)} · pagamento anterior ${formatDateOnlyBR(map.previousPaymentDate)} · ${row.retroactiveDays} de ${row.referenceCalculationDays} dias do mês anterior` : row.admissionDate ? "Sem retroativo" : "Data de Admissão não cadastrada"}>{money(row.retroactiveAmount)}{adjustmentNote(row.retroactiveUnjustifiedAbsence, row.retroactiveVacationDays, row.retroactivePayableDays) ? <span className={`block text-[11px] ${row.retroactiveUnjustifiedAbsence ? "text-error" : "text-secondary"}`}>{adjustmentNote(row.retroactiveUnjustifiedAbsence, row.retroactiveVacationDays, row.retroactivePayableDays)}</span> : row.retroactiveDays > 0 && <span className="block text-[11px] text-secondary">{row.retroactiveDays} de {row.referenceCalculationDays} dias</span>}</td><td className="whitespace-nowrap py-2 pr-2 text-right font-semibold">{money(row.amount)}</td><td className="py-2 pr-2">{row.observation || "—"}</td><td className="whitespace-nowrap py-2 text-right"><button type="button" className="text-xs font-semibold text-primary" onClick={() => setCorrecting({ map, row })}>Corrigir</button></td></tr>)}</tbody></table></div>
            </AllocationDepartmentAccordion>)}</div>
          </AllocationDepartmentAccordion>)}</AllocationDepartmentList>
          <div className={`mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md border px-3 py-2 text-sm ${diff !== 0 || !tree.consistent ? "border-error/40 bg-error/5 text-error" : "border-border"}`} role={diff !== 0 ? "alert" : undefined}><span>Valor total <strong>{money(map.totalAmount)}</strong></span><span>Rateado <strong>{moneyCents(tree.totals.totalCents)}</strong></span><span>Obrigação <strong>{map.financialRecord ? money(map.financialRecord.grossAmount) : "—"}</strong></span><span>Diferença <strong>{moneyCents(diff)}</strong></span></div>
          <div className="mt-4 flex flex-wrap gap-2"><a href={`/api/accounts-payable/basic-basket/${map.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}>Download do rateio XLSX</a><Button size="sm" variant="error" onClick={() => setDeleteTarget({ mapId: map.id })}>Cancelar lançamento</Button></div>
        </AllocationCard>;
      }) : <div className="card"><EmptyState title="Nenhum lançamento nesta competência." description="Preencha as etapas para gerar o rateio." /></div>}
    </section>}

    {tab === "resumo" && <section role="tabpanel" className="grid gap-4">
      {all.length ? <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Colaboradores" value={String(summary.totals.people)} /><MetricCard label="Bonificação" value={moneyCents(summary.totals.driverBonusCents)} /><MetricCard label="Acordo" value={moneyCents(summary.totals.agreementCents)} /><MetricCard label="Cesta Básica" value={moneyCents(summary.totals.basketCents)} /><MetricCard label="Retroativo" value={moneyCents(summary.totals.retroactiveCents)} /><MetricCard label="Total Geral" value={moneyCents(summary.totals.totalCents)} accent /></div>
        <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-border bg-base-200 text-left text-xs"><th className="p-2">Empresa / Centro de Custo</th><th className="p-2 text-center">Colaboradores</th><th className="p-2 text-right">Bonificação</th><th className="p-2 text-right">Acordo</th><th className="p-2 text-right">Cesta Básica</th><th className="p-2 text-right">Retroativo</th><th className="p-2 text-right">Total</th></tr></thead>
          <tbody>{summary.companies.map((company) => [<tr key={company.company} className="border-b border-border bg-base-100 font-semibold"><td className="p-2">{company.company}</td><td className="p-2 text-center">{company.totals.people}</td><td className="p-2 text-right">{moneyCents(company.totals.driverBonusCents)}</td><td className="p-2 text-right">{moneyCents(company.totals.agreementCents)}</td><td className="p-2 text-right">{moneyCents(company.totals.basketCents)}</td><td className="p-2 text-right">{moneyCents(company.totals.retroactiveCents)}</td><td className="p-2 text-right text-primary">{moneyCents(company.totals.totalCents)}</td></tr>,
            ...company.costCenters.map((costCenter) => <tr key={`${company.company}|${costCenter.costCenter}`} className="border-b border-border"><td className="p-2 pl-6">↳ {costCenter.costCenter}</td><td className="p-2 text-center">{costCenter.totals.people}</td><td className="p-2 text-right">{moneyCents(costCenter.totals.driverBonusCents)}</td><td className="p-2 text-right">{moneyCents(costCenter.totals.agreementCents)}</td><td className="p-2 text-right">{moneyCents(costCenter.totals.basketCents)}</td><td className="p-2 text-right">{moneyCents(costCenter.totals.retroactiveCents)}</td><td className="p-2 text-right">{moneyCents(costCenter.totals.totalCents)}</td></tr>)])}</tbody></table></div>
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 px-4 py-3 ${difference !== 0 || !summary.consistent ? "border-error bg-error/5 text-error" : "border-primary/40 bg-primary/5"}`}><strong>Total Geral</strong><strong className="text-xl">{moneyCents(summary.totals.totalCents)}</strong><span className="basis-full text-xs">{difference === 0 && summary.consistent ? "Colaboradores = centros de custo = empresas = lançamentos · diferença R$ 0,00" : `Inconsistência: diferença ${moneyCents(difference)}`}</span></div>
      </> : <div className="card"><EmptyState title="Nenhum lançamento nesta competência." /></div>}
    </section>}

    <CorrectionModal target={correcting} companies={companies} onClose={() => setCorrecting(null)} onSaved={reload} />
    <CompanyModal open={companyModal} onClose={() => setCompanyModal(false)} onCreated={(company) => setCompanies((current) => [...current, company].sort((a, b) => comparePtBr(companyLabel(a), companyLabel(b))))} />
    <DeletionModal open={deleteTarget !== null} title="Cancelar todo o lançamento?" description="O lançamento e a obrigação serão cancelados." count={1} requireKeyword busy={deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={confirmDelete} />
    {deleteError && <div role="alert" className="alert alert-error text-sm">{deleteError}</div>}
  </div>;
}
