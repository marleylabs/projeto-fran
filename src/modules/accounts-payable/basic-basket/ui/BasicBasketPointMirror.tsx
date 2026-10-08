"use client";

// Espelho de Ponto da Cesta Básica no fluxo visual padrão (ImportFlow + UploadDropzone). SÓ APRESENTAÇÃO: o envio do
// arquivo, a prévia do servidor, o "Aplicar" (que só guarda o id da importação para a prévia) e a comparação
// antes/depois continuam na BasicBasketSection e chegam aqui por props/callbacks. Nada aqui calcula valor.
import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, DataTable, FeedbackAlert, ImportFlow, StatusBadge, type DataTableColumn, type ImportFlowStep, type ImportIssue, type StatusTone } from "@/components/ui";
import { formatDateOnlyBR } from "@/lib/date-only";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { BASIC_BASKET_CALCULATION_DAYS, type BasicBasketAdjustments } from "../calculations";
import { moneyCents, people as peopleLabel } from "./format";
import { InfoTip, Note } from "./parts";

export type PointMirrorStatus = "ABSENCE" | "VACATION" | "NEXT_COMPETENCE" | "BEFORE_ADMISSION" | "NO_OCCURRENCE" | "OUT_OF_PERIOD" | "NOT_SELECTED" | "NOT_ELIGIBLE" | "NOT_FOUND" | "INVALID_CPF" | "NOT_IN_FILE" | "MISSING_ADMISSION";
export type PointMirrorPerson = { employeeId: string | null; employeeName: string; department: string | null; cpfMasked: string; status: PointMirrorStatus; apurationAbsence: string; nextCompetenceAbsence: string; beforeAdmissionAbsence: string; beforeAdmissionVacation: string; vacationBlocks: Array<{ month: "current" | "reference"; label: string; financialDays: number; extended: boolean; isolatedLastDay: boolean }>; outOfPeriodRows: number; currentVacation: string; referenceVacation: string; currentVacationDates: number; referenceVacationDates: number; absenceEventWithoutJourney: number; duplicateVacationRows: number; currentBasketDays: number; retroactiveDays: number; adjustments: BasicBasketAdjustments | null };
export type PointMirrorPreview = { importId: string; reference: { current: string; previous: string; absence: string; absenceStart: string; absenceEnd: string }; totals: Record<string, number>; people: PointMirrorPerson[] };
type LineTotals = { totalCents: number; currentPayableDays: number; retroactivePayableDays: number };
export type PointMirrorComparison = { before: LineTotals; after: LineTotals } | null;

// Tom visual da situação (o TEXTO vem da seção; a cor só reforça).
const STATUS_TONE: Partial<Record<PointMirrorStatus, StatusTone>> = { ABSENCE: "danger", VACATION: "info", NEXT_COMPETENCE: "warning", NOT_FOUND: "warning", INVALID_CPF: "warning", MISSING_ADMISSION: "warning" };

export type BasicBasketPointMirrorProps = {
  description: ReactNode;
  file: File | null;
  busy: boolean;
  preview: (PointMirrorPreview & { competence: string }) | null;
  stale: boolean;
  /** Quantidade de colaboradores com ajustes aplicados à prévia (null = nenhuma aplicação ativa). */
  appliedCount: number | null;
  /** A importação aplicada é a mesma da prévia exibida. */
  appliedIsCurrent: boolean;
  applyLabel: string;
  statusText: (person: PointMirrorPerson) => string;
  compare: (person: PointMirrorPerson) => PointMirrorComparison;
  onSelect: (file: File) => void;
  onClearFile: () => void;
  onProcess: () => void;
  onApply: () => void;
  onReset: () => void;
  onRemoveAdjustments: () => void;
};

export function BasicBasketPointMirror({ description, file, busy, preview, stale, appliedCount, appliedIsCurrent, applyLabel, statusText, compare, onSelect, onClearFile, onProcess, onApply, onReset, onRemoveAdjustments }: BasicBasketPointMirrorProps) {
  const step: ImportFlowStep = busy ? "processing" : preview && appliedIsCurrent ? "done" : preview ? "preview" : "select";
  const t = preview?.totals ?? {};
  const errors: ImportIssue[] = stale ? [{ id: "stale", message: "A competência mudou depois do processamento; processe o arquivo novamente." }] : [];
  const warnings: ImportIssue[] = [
    ...(t.isolatedLastDayVacation > 0 ? [{ id: "isolated", message: `${t.isolatedLastDayVacation} colaborador(es) com Férias registradas apenas no último dia do mês. Não foi inferida continuidade até o dia comercial ${BASIC_BASKET_CALCULATION_DAYS}.` }] : []),
    ...(t.absenceEventWithoutJourney > 0 ? [{ id: "journey", message: `${t.absenceEventWithoutJourney} linha(s) com Eventos = “FALTA INJUSTIFICADA” sem Jornada Considerada = “Falta”: não cortam a Cesta (a regra exige as duas condições). Confira o arquivo.` }] : []),
  ];
  const appliedText = appliedCount !== null && `Faltas e Férias aplicadas à prévia (${appliedCount} colaborador(es)). Uma nova aplicação substitui esta.`;

  return (
    <div className="grid gap-3">
      {appliedText && step !== "done" && (
        <FeedbackAlert status="success" title="Ajustes do Espelho de Ponto ativos">
          <span>{appliedText} </span>
          <button type="button" className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline" onClick={onRemoveAdjustments}>Remover ajustes</button>
        </FeedbackAlert>
      )}
      <ImportFlow
        step={step}
        title="Importar Espelho de Ponto — Faltas e Férias (opcional)"
        description={description}
        file={file ? { name: file.name, size: file.size } : null}
        onSelect={onSelect}
        onClearFile={onClearFile}
        accept=".xlsx,.csv"
        uploadLabel="Espelho de Ponto (XLSX ou CSV)"
        uploadHelper="Identificação somente por CPF. O arquivo não é armazenado."
        onProcess={onProcess}
        processingText="Processando o Espelho de Ponto…"
        errors={errors}
        warnings={warnings}
        canApply={!stale}
        onApply={onApply}
        applyLabel={applyLabel}
        onReset={onReset}
        resetLabel="Processar outro arquivo"
        preview={preview && <PointMirrorPreviewContent preview={preview} statusText={statusText} compare={compare} />}
        result={appliedText && (
          <FeedbackAlert status="success" icon={<CheckCircle2 size={18} />} title="Aplicado à prévia — ainda não salvo">
            <p>{appliedText} Confira a tabela de colaboradores e use “Salvar / Gerar Rateio” para confirmar.</p>
            <div className="mt-2"><Button size="sm" variant="secondary" onClick={onRemoveAdjustments}>Remover ajustes</Button></div>
          </FeedbackAlert>
        )}
      />
    </div>
  );
}

function PointMirrorPreviewContent({ preview, statusText, compare }: { preview: PointMirrorPreview; statusText: (person: PointMirrorPerson) => string; compare: (person: PointMirrorPerson) => PointMirrorComparison }) {
  const t = preview.totals;
  const kpis = [["Linhas analisadas", t.rows], ["Colaboradores encontrados", t.located], ["Cesta cortada por Falta Injustificada", t.absence], ["Colaboradores com Férias", t.vacation], ["Sem ocorrência", t.noOccurrence + t.notInFile], ["Afeta a próxima competência", t.nextCompetence], ["Anterior à admissão (ignorada)", t.beforeAdmission], ["Fora do período de apuração", t.outOfPeriod], ["Não localizados", t.notFound], ["CPF inválido", t.invalidCpfPeople]] as const;
  // Ordem de leitura: quem tem ajuste primeiro, depois por nome (apenas exibição).
  const rows = [...preview.people].sort((a, b) => Number(Boolean(b.adjustments)) - Number(Boolean(a.adjustments)) || comparePtBr(a.employeeName, b.employeeName));
  const position = new Map(rows.map((person, index) => [person, index]));
  const reference = preview.reference;
  const columns: DataTableColumn<PointMirrorPerson>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, sticky: "start", width: "13rem", cell: (person) => <span className="block truncate">{person.employeeName}</span> },
    { id: "cpf", header: "CPF", cell: (person) => <span className="tabular-nums text-foreground-muted">{person.cpfMasked || "—"}</span> },
    { id: "department", header: "Departamento", cell: (person) => person.department ?? "—" },
    { id: "status", header: "Situação", wrap: true, className: "min-w-[15rem]", cell: (person) => {
      const tone = STATUS_TONE[person.status];
      const detail = person.adjustments?.currentUnjustifiedAbsence ? `Falta em ${person.apurationAbsence}/${reference.absence.slice(3)}, dentro do mês de apuração da Cesta de ${reference.current}.` : person.status === "NEXT_COMPETENCE" ? `Falta em ${person.nextCompetenceAbsence}/${reference.current.slice(3)}: será considerada na apuração da próxima competência.` : null;
      return (
        <div className="grid justify-items-start gap-0.5">
          <span className="inline-flex items-center gap-1">
            {tone ? <span className="flex flex-wrap gap-1">{statusText(person).split(" · ").map((part) => <StatusBadge key={part} tone={tone}>{part}</StatusBadge>)}</span> : <span className="text-foreground-muted">{statusText(person)}</span>}
            {detail && <InfoTip label={`Detalhe da situação de ${person.employeeName}`} content={detail} />}
          </span>
          {person.adjustments?.currentUnjustifiedAbsence && <Note>Falta em {person.apurationAbsence} — mês de apuração {reference.absence}</Note>}
          {person.status !== "NEXT_COMPETENCE" && person.nextCompetenceAbsence && <Note tone="warning">Falta em {person.nextCompetenceAbsence}: afeta a próxima competência</Note>}
        </div>
      );
    } },
    { id: "absence", header: "Faltas Injustificadas", wrap: true, className: "min-w-[12rem]", cell: (person) => (
      <>
        {[person.apurationAbsence && `Apuração ${reference.absence}: ${person.apurationAbsence}`, person.nextCompetenceAbsence && `Próxima competência: ${person.nextCompetenceAbsence}`].filter(Boolean).join(" · ") || (person.beforeAdmissionAbsence ? "" : "—")}
        {person.beforeAdmissionAbsence && <Note><span className="line-through decoration-foreground-muted/50">{person.beforeAdmissionAbsence}</span> — anterior à admissão, ignorada</Note>}
      </>
    ) },
    { id: "vacation", header: "Férias", wrap: true, className: "min-w-[14rem]", cell: (person) => (
      <>
        {person.vacationBlocks.length ? person.vacationBlocks.map((block, index) => (
          <span key={`${block.month}-${index}`} className="flex items-start gap-1">
            <span>{block.month === "reference" ? `${reference.previous} (Retroativo): ` : ""}{block.label} · {block.financialDays} {block.financialDays === 1 ? "dia" : "dias financeiros"}{block.isolatedLastDay && <Note tone="warning">Ocorrência isolada no último dia do mês; continuidade até o dia comercial {BASIC_BASKET_CALCULATION_DAYS} não inferida.</Note>}</span>
            {block.extended && <InfoTip label={`Detalhe das Férias de ${person.employeeName}`} content={`Período contínuo até o fim do mês. Para a Cesta Básica, a base financeira é de ${BASIC_BASKET_CALCULATION_DAYS} dias.`} />}
          </span>
        )) : (person.beforeAdmissionVacation ? "" : "—")}
        {person.beforeAdmissionVacation && <Note>{person.beforeAdmissionVacation} — Anterior à admissão — não reduz</Note>}
      </>
    ) },
    { id: "daysBefore", header: "Dias antes", numeric: true, cell: (person) => (person.adjustments ? `${person.currentBasketDays}/${BASIC_BASKET_CALCULATION_DAYS}${person.retroactiveDays > 0 ? ` · Retro ${person.retroactiveDays}` : ""}` : "—") },
    { id: "daysAfter", header: "Dias depois", numeric: true, cell: (person) => { const result = compare(person); return result ? <strong>{`${result.after.currentPayableDays}/${BASIC_BASKET_CALCULATION_DAYS}${person.retroactiveDays > 0 ? ` · Retro ${result.after.retroactivePayableDays}` : ""}`}</strong> : "—"; } },
    { id: "valueBefore", header: "Valor antes", numeric: true, cell: (person) => { const result = compare(person); return result ? moneyCents(result.before.totalCents) : "—"; } },
    { id: "valueAfter", header: "Valor depois", numeric: true, cell: (person) => { const result = compare(person); return result ? <strong>{moneyCents(result.after.totalCents)}</strong> : "—"; } },
  ];
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-control border border-border bg-surface-muted px-3 py-2">
            <dt className="text-caption text-foreground-muted">{label}</dt>
            <dd className="text-card-title tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-foreground-muted">Competência {reference.current} · mês de apuração das Faltas {reference.absence} ({formatDateOnlyBR(reference.absenceStart)} a {formatDateOnlyBR(reference.absenceEnd)}) · Retroativo/Férias do mês anterior {reference.previous}{t.duplicateVacationRows ? ` · ${t.duplicateVacationRows} linha(s) de Férias repetida(s) desconsiderada(s)` : ""}{t.notSelected ? ` · ${t.notSelected} encontrado(s) no arquivo, mas não selecionado(s)` : ""}.</p>
      <DataTable caption={`Prévia do Espelho de Ponto — ${peopleLabel(rows.length)}`} columns={columns} rows={rows} getRowId={(person) => `${person.employeeId ?? person.cpfMasked}-${position.get(person)}`} density="dense" minWidth="1180px" maxHeight="24rem" />
      <p className="text-caption text-foreground-muted">Substitui (não soma) ajustes aplicados antes. Não salva o lançamento: confira a prévia e use “Salvar / Gerar Rateio”.</p>
    </div>
  );
}
