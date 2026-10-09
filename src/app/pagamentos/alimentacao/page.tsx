"use client";
// Despesas → Alimentação (MA/PA) + subseções Café da Manhã e Cesta Básica. Fase 7H: apresentação no Design System (Tabs,
// Card, Field, CurrencyInput, UploadDropzone, DataTable, StatusBadge, AllocationViews), no mesmo padrão de Cesta, Café e
// VT. Estado, chamadas de API, validações da prévia e payloads continuam AQUI; os componentes em food/ui só exibem.
// Regras MA/PA (ciclos, NF → empresa, snapshots, rateios, XLSX) seguem no servidor e nos helpers já existentes.
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, ListTree, PencilLine, Trash2 } from "lucide-react";
import {
  Button,
  CalculatedValue,
  Card,
  CardHeader,
  CurrencyInput,
  DataTable,
  DeletionModal,
  EmptyState,
  FeedbackAlert,
  Field,
  PageHeader,
  SearchInput,
  StatusBadge,
  TabPanel,
  Tabs,
  UploadDropzone,
  buttonClassName,
  textInputClassName,
  useToast,
  type DataTableColumn,
  type FileInputStatus,
} from "@/components/ui";
import { formatCnpj } from "@/modules/administrative-entities/schema";
import { FoodMaReview } from "@/modules/accounts-payable/food/ui/FoodMaReview";
import { FoodMaEditor } from "@/modules/accounts-payable/food/ui/FoodMaEditor";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { AllocationViews } from "@/components/allocation/AllocationViews";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { normalizeAllocationRow, type AllocationViewId } from "@/modules/accounts-payable/shared/allocation-views";
import type { FoodRateioViewRow } from "@/modules/accounts-payable/food/rateio-views";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { BreakfastSection } from "@/modules/accounts-payable/breakfast/BreakfastSection";
import { BasicBasketSection } from "@/modules/accounts-payable/basic-basket/BasicBasketSection";
import { MultiDatePicker } from "@/components/MultiDatePicker";
import { compareDateThenId, comparePtBr, sortedPtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { CompetenceSummary } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import { BenefitCompetenceContext, BenefitHistory, BenefitWorkspace, type BenefitTab } from "@/modules/accounts-payable/shared/ui/BenefitWorkspace";
import { Disclosure, Note } from "@/modules/accounts-payable/shared/ui/parts";
import {
  FoodInformativeTotalSummary,
  FoodLocalitySummary,
} from "@/modules/accounts-payable/food/ui/FoodLocalitySummary";
import { FoodOccurrenceTable } from "@/modules/accounts-payable/food/ui/FoodOccurrenceTable";
import { FoodPaManualTable } from "@/modules/accounts-payable/food/ui/FoodPaManualTable";
import { FoodPaCompanyRateio, FoodSectorRateio, FoodViewLeaf } from "@/modules/accounts-payable/food/ui/FoodRateioParts";
import type { FoodBatchStatus } from "@/modules/accounts-payable/food/batch-state";
import { parseManualFoodResponse } from "@/modules/accounts-payable/food/manual-contract";
import { FOOD_PA_INVOICE_REQUIRED_MESSAGE, isFoodPaInvoiceCode, type FoodPaInvoiceCode, type FoodPaRateioCompany } from "@/modules/accounts-payable/food/invoice-company";

type Locality = "MA" | "PA";
type Entity = {
  id: string;
  cnpj: string | null;
  legalName: string;
  tradeName: string;
  activityArea: string;
  locality: string;
};
type Allocation = {
  id: string;
  sourceIdentifier: string | null;
  employeeName: string;
  department: string;
  locality: string;
  unitPrice: string;
  amount: string;
  administrativeEntityId: string;
  competenceId: string;
};
type Issue = { id: string; sourceRow: number | null; message: string };
type FoodEmployee = CollaboratorOption;
type MealOccurrence = {
  id: string;
  sourceRow: number;
  occurredOn: string | null;
  mealQuantity: number;
  receivedName: string;
  normalizedReceivedName: string;
  receivedDepartment: string;
  employeeId: string | null;
  officialName: string | null;
  confirmedDepartment: string | null;
  duplicateCandidate: boolean;
  disposition: "VALID" | "DUPLICATE" | "IGNORED";
  matchMethod: string;
  invoiceEmission: string | null;
  restaurantName: string | null;
  amount: string;
};
type Batch = {
  id: string;
  locality: Locality;
  cycle: number;
  version: number;
  status: FoodBatchStatus;
  originalName: string;
  unitPrice: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalAmount: string;
  administrativeEntity: Entity;
  financialRecord: { identifier: string } | null;
  allocations: Allocation[];
  mealOccurrences: MealOccurrence[];
  mealOccurrenceCount: number;
  // Somente PA: rateio por Empresa derivado da Emissão NF de cada colaborador (calculado no servidor).
  companyRateio?: { companies: FoodPaRateioCompany[]; totalCents: number; companiesCents: number; consistent: boolean } | null;
  // Base das 4 perspectivas de rateio (servidor; Fase 7E.2): valor salvo por refeição + snapshots/NF.
  rateioViews?: { rows: FoodRateioViewRow[]; totalCents: number; legacyCompany: number; legacyCostCenter: number } | null;
  issues: Issue[];
  revisions: { revision: number; createdAt: string }[];
};
function FoodDeletionControls({
  batch,
  reload,
}: {
  batch: Batch;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<"records" | "batch" | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const visible = batch.mealOccurrences
    .filter((row) =>
      `${row.officialName ?? row.receivedName} ${row.confirmedDepartment ?? row.receivedDepartment} ${row.occurredOn ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .includes(
          query
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, ""),
        ),
    )
    .sort(
      (a, b) =>
        comparePtBr(
          a.officialName ?? a.receivedName,
          b.officialName ?? b.receivedName,
        ) ||
        compareDateThenId(a.occurredOn ?? "", b.occurredOn ?? "", a.id, b.id),
    );
  const requestDelete = (ids: string[]) => {
    setPendingIds(ids);
    setTarget("records");
    setDeleteError(null);
  };
  const close = () => {
    if (!busy) {
      setTarget(null);
      setPendingIds([]);
    }
  };
  async function confirm(reason: string) {
    setBusy(true);
    setDeleteError(null);
    try {
      const url =
        target === "batch"
          ? `/api/accounts-payable/food/${batch.id}`
          : `/api/accounts-payable/food/${batch.id}/records`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          target === "batch"
            ? { reason, confirmation: "EXCLUIR" }
            : { ids: pendingIds, reason },
        ),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSelected([]);
      setTarget(null);
      setPendingIds([]);
      await reload();
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o registro.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="error" size="sm" onClick={() => setTarget("batch")}>
          <Trash2 size={14} aria-hidden="true" />
          Excluir lote
        </Button>
        {batch.mealOccurrences.length > 0 && (
          <span className="text-caption text-foreground-muted">
            O arquivo original será preservado para auditoria.
          </span>
        )}
      </div>
      {batch.mealOccurrences.length > 0 && (
        <Disclosure title="Gerenciar lançamentos e refeições" meta={`${batch.mealOccurrences.length} ocorrência(s)`} level={2} defaultOpen>
          <div className="grid gap-3">
            <SearchInput label="Filtrar por colaborador, setor ou data" placeholder="Filtrar por colaborador, setor ou data" value={query} onValueChange={setQuery} />
            <div className="flex flex-wrap items-center gap-3 text-body">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([...new Set([...selected, ...visible.map((row) => row.id)])])}>
                Selecionar todos os resultados ({visible.length})
              </Button>
              {selected.length > 0 && (
                <>
                  <span className="tabular-nums" role="status">{selected.length} selecionado(s)</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>Limpar seleção</Button>
                  <Button type="button" variant="error" size="sm" onClick={() => requestDelete(selected)}>Excluir selecionados</Button>
                </>
              )}
            </div>
            <FoodOccurrenceTable
              rows={visible.map((row) => ({ id: row.id, name: row.officialName ?? row.receivedName, occurredOn: row.occurredOn, mealQuantity: row.mealQuantity, department: row.confirmedDepartment ?? row.receivedDepartment, amount: row.amount }))}
              selected={selected}
              onSelectedChange={setSelected}
              onDelete={requestDelete}
            />
          </div>
        </Disclosure>
      )}
      {deleteError && <FeedbackAlert status="error">{deleteError}</FeedbackAlert>}
      <DeletionModal
        open={target !== null}
        title={
          target === "batch"
            ? "Excluir todo o lote?"
            : `Excluir ${pendingIds.length > 1 ? `${pendingIds.length} ocorrências` : "ocorrência"}?`
        }
        description={
          target === "batch" ? (
            <>
              <strong>
                {batch.locality} ·{" "}
                {batch.cycle ? `${batch.cycle}º Ciclo · ` : ""}
                {batch.administrativeEntity.tradeName}
              </strong>
              <br />
              {batch.validRows} refeições · {batch.allocations.length}{" "}
              colaboradores · {money(batch.totalAmount)}
              <br />O lote e a obrigação serão cancelados; o arquivo original
              será preservado.
            </>
          ) : (
            "Essa ação cancelará os registros, recalculará colaboradores, setores, total, obrigação e download."
          )
        }
        count={target === "batch" ? 1 : pendingIds.length}
        requireKeyword={target === "batch"}
        busy={busy}
        onClose={close}
        onConfirm={confirm}
      />
    </div>
  );
}
const FOOD_SUBSECTIONS = [
  { value: "alimentacao", label: "Alimentação" },
  { value: "cafe", label: "Café da Manhã" },
  { value: "cesta", label: "Cesta Básica" },
];
const ENTRY_MODES = [
  { value: "upload", label: "Upload de arquivo" },
  { value: "manual", label: "Lançamento manual" },
];
const CYCLES = [
  { value: "1", label: "1º Ciclo · Dias 1 a 15" },
  { value: "2", label: "2º Ciclo · Dia 16 ao fim do mês" },
];

const money = (value: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value),
  );
// CurrencyInput ↔ texto guardado pela tela: o mesmo texto decimal de antes ("15.50", ponto) vai para o servidor, que
// valida o valor. O valor recebido (ex.: preço do cadastro) é exibido sem cortar casas; só a digitação passa a ter 2 casas.
const currencyValue = (text: string) => { const normalized = text.trim().replace(",", "."); return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null; };
const currencyText = (value: number | null) => (value === null ? "" : value.toFixed(2));
const uniqueCollaborators = (values: Batch[]) =>
  new Set(
    values.flatMap((batch) =>
      batch.allocations.map(
        (allocation) =>
          allocation.sourceIdentifier ||
          allocation.employeeName
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLocaleLowerCase("pt-BR")
            .replace(/\s+/g, " ")
            .trim(),
      ),
    ),
  ).size;
const accepts = (value: string, locality: Locality) =>
  value
    .toUpperCase()
    .split(/[\/,;]/)
    .map((part) => part.trim())
    .includes(locality);

// Legenda da tabela final com o caminho completo do grupo (evita legendas repetidas, ex.: o mesmo setor em duas empresas).
const leafPath = (view: AllocationViewId, row: { company: string; costCenter: string; department: string } | undefined) => !row ? "" : (view === "department" ? [row.department] : view === "costCenter" ? [row.costCenter] : view === "companyDepartment" ? [row.company, row.department] : [row.company, row.costCenter, row.department]).join(" / ");

function MaRateio({
  batch,
  employees,
  reload,
}: {
  batch: Batch;
  employees: FoodEmployee[];
  reload: () => Promise<void>;
}) {
  const [editorOccurrences, setEditorOccurrences] = useState<
    MealOccurrence[] | null
  >(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const toast = useToast();
  async function beginEditing() {
    setLoadingEditor(true);
    try {
      const response = await fetch(
        `/api/accounts-payable/food/${batch.id}/records`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEditorOccurrences(body.occurrences);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o rateio para edição.",
      );
    } finally {
      setLoadingEditor(false);
    }
  }
  const sectors = new Map<string, Allocation[]>();
  for (const row of batch.allocations) {
    const sector = normalizeOrganizationalValue(row.department);
    sectors.set(sector, [...(sectors.get(sector) ?? []), row]);
  }
  // Perspectivas de rateio (só agrupam valores já salvos), todas sobre a base do servidor (rateioViews): Departamento
  // (lista de setores de sempre), Centro de Custo (snapshot), Empresa/Departamento e Empresa/CC/Departamento (Empresa:
  // snapshot no MA; Emissão NF no PA). Refeições anteriores à captura aparecem em "Sem centro de custo"/"Sem empresa".
  const [view, setView] = useState<AllocationViewId>("department");
  const viewRows = (batch.rateioViews?.rows ?? []).map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: row.cents, source: row }));
  const legacyNotice = [
    batch.rateioViews?.legacyCostCenter ? "Centro de Custo" : "",
    batch.locality === "MA" && batch.rateioViews?.legacyCompany ? "Empresa" : "",
  ].filter(Boolean);
  // Perspectiva Departamento: setores das alocações salvas (refeições = valor ÷ unitário salvos, como sempre foi exibido).
  const sectorGroups = [...sectors.entries()]
    .sort(([a], [b]) => comparePtBr(a, b))
    .map(([sector, rows]) => ({
      sector,
      collaborators: new Set(rows.map((row) => row.sourceIdentifier ?? row.employeeName)).size,
      meals: rows.reduce((sum, row) => sum + Number(row.amount) / Number(row.unitPrice), 0),
      amount: rows.reduce((sum, row) => sum + Number(row.amount), 0),
      people: sortedPtBr(rows, (row) => row.employeeName, (a, b) => comparePtBr(a.id, b.id)).map((row) => ({ id: row.id, name: row.employeeName, meals: Number(row.amount) / Number(row.unitPrice), amount: row.amount })),
    }));
  return (
    <Card padding="none" as="article" className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5">
        <CardHeader
          title={batch.administrativeEntity.tradeName}
          description={`cadastro_id: ${batch.administrativeEntity.id} · v${batch.version}${batch.revisions?.length ? ` · ${batch.revisions.length} revisão(ões)` : ""}`}
          actions={<StatusBadge tone="success">Pronto · Aguardando Financeiro</StatusBadge>}
        />
        <CompetenceSummary
          className="xl:grid-cols-4"
          items={[
            { label: "Registros importados / válidos", value: `${batch.totalRows} / ${batch.validRows}` },
            { label: "Colaboradores únicos / setores", value: `${batch.allocations.length} / ${sectors.size}` },
            { label: "Refeições · valor unitário", value: `${batch.validRows} · ${money(batch.unitPrice)}` },
            { label: `Total ${batch.locality} · obrigação`, value: money(batch.totalAmount), helper: batch.financialRecord?.identifier, emphasis: true },
          ]}
        />
        {batch.locality === "PA" && batch.companyRateio && (
          <FoodPaCompanyRateio companies={batch.companyRateio.companies} companiesCents={batch.companyRateio.companiesCents} expectedCents={Math.round(Number(batch.totalAmount) * 100)} consistent={batch.companyRateio.consistent} />
        )}
        <AllocationViews
          rows={viewRows}
          value={view}
          onValueChange={setView}
          notice={legacyNotice.length && view !== "department" ? `Alguns lançamentos anteriores à captura histórica de ${legacyNotice.join(" e ")} aparecem como ${legacyNotice.map((label) => (label === "Empresa" ? "“Sem empresa”" : "“Sem centro de custo”")).join(" / ")}.` : undefined}
          expectedCents={amountToCents(batch.totalAmount)}
          custom={{ department: <FoodSectorRateio sectors={sectorGroups} /> }}
          renderLeaf={(rows, node) => <FoodViewLeaf rows={rows} caption={`${batch.administrativeEntity.tradeName} — ${leafPath(view, rows[0]) || node.label}`} />}
        />
        {editorOccurrences && (
          <FoodMaEditor
            batchId={batch.id}
            locality={batch.locality}
            occurrences={editorOccurrences}
            employees={employees}
            cancel={() => setEditorOccurrences(null)}
            reload={reload}
          />
        )}
        <FoodDeletionControls batch={batch} reload={reload} />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
        <Button type="button" onClick={beginEditing} loading={loadingEditor} variant="secondary" size="sm">
          <PencilLine size={14} aria-hidden="true" />
          Editar rateio
        </Button>
        <a
          href={`/api/accounts-payable/food/${batch.id}/download`}
          className={buttonClassName({ variant: "secondary", size: "sm" })}
        >
          <Download size={14} aria-hidden="true" />
          Download do rateio XLSX
        </a>
      </div>
    </Card>
  );
}

// Fase 7N: na Operação, o lote pronto (com refeições) aparece como resumo; o rateio completo (perspectivas, edição e
// exclusão) fica na aba Rateio. Mesmos dados do lote; nenhuma chamada nova.
function FoodBatchReadyCard({ batch, onOpenRateio }: { batch: Batch; onOpenRateio: () => void }) {
  const sectors = new Set(batch.allocations.map((row) => normalizeOrganizationalValue(row.department))).size;
  return (
    <Card padding="none" as="article" className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5">
        <CardHeader
          title={batch.administrativeEntity.tradeName}
          description={`cadastro_id: ${batch.administrativeEntity.id} · v${batch.version}${batch.revisions?.length ? ` · ${batch.revisions.length} revisão(ões)` : ""}`}
          actions={<StatusBadge tone="success">Pronto · Aguardando Financeiro</StatusBadge>}
        />
        <CompetenceSummary
          className="xl:grid-cols-4"
          items={[
            { label: "Registros importados / válidos", value: `${batch.totalRows} / ${batch.validRows}` },
            { label: "Colaboradores únicos / setores", value: `${batch.allocations.length} / ${sectors}` },
            { label: "Refeições · valor unitário", value: `${batch.validRows} · ${money(batch.unitPrice)}` },
            { label: `Total ${batch.locality} · obrigação`, value: money(batch.totalAmount), helper: batch.financialRecord?.identifier, emphasis: true },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
        <Button type="button" onClick={onOpenRateio} variant="secondary" size="sm">
          <ListTree size={14} aria-hidden="true" />
          Ver rateio
        </Button>
        <a href={`/api/accounts-payable/food/${batch.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}>
          <Download size={14} aria-hidden="true" />
          Download do rateio XLSX
        </a>
        <span className="text-caption text-foreground-muted">Edição e exclusão de registros ficam na aba Rateio.</span>
      </div>
    </Card>
  );
}

function BatchCard({
  batch,
  employees,
  reload,
  resetImport,
  onOpenRateio,
}: {
  batch: Batch;
  employees: FoodEmployee[];
  reload: () => Promise<void>;
  resetImport: () => void;
  /** Presente na Operação: lote pronto vira resumo com atalho para a aba Rateio. */
  onOpenRateio?: () => void;
}) {
  const [details, setDetails] = useState(false);
  const sectors = useMemo(() => {
    const values = new Map<
      string,
      { collaborators: Set<string>; amount: number }
    >();
    for (const row of batch.allocations) {
      const sector = normalizeOrganizationalValue(row.department);
      const current = values.get(sector) ?? {
        collaborators: new Set<string>(),
        amount: 0,
      };
      current.collaborators.add(row.sourceIdentifier ?? row.employeeName);
      values.set(sector, {
        collaborators: current.collaborators,
        amount: current.amount + Number(row.amount),
      });
    }
    return [...values.entries()].sort(([a], [b]) => comparePtBr(a, b));
  }, [batch]);
  if (batch.status === "UNDER_REVIEW")
    return (
      <FoodMaReview
        batch={batch}
        employees={employees}
        reload={reload}
        resetImport={resetImport}
      />
    );
  if (batch.mealOccurrenceCount > 0 && batch.status === "READY")
    return onOpenRateio ? <FoodBatchReadyCard batch={batch} onOpenRateio={onOpenRateio} /> : <MaRateio batch={batch} employees={employees} reload={reload} />;
  const allocationColumns: DataTableColumn<Allocation>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "16rem", cell: (row) => <span className="block truncate">{row.employeeName}</span> },
    { id: "sector", header: "Setor", cell: (row) => row.department },
    { id: "unit", header: "Unitário", numeric: true, cell: (row) => money(row.unitPrice) },
    { id: "amount", header: "Valor", numeric: true, cell: (row) => <strong>{money(row.amount)}</strong> },
  ];
  type SectorRow = { sector: string; collaborators: number; amount: number };
  const sectorColumns: DataTableColumn<SectorRow>[] = [
    { id: "sector", header: "Setor", rowHeader: true, cell: (row) => row.sector },
    { id: "people", header: "Colaboradores", numeric: true, cell: (row) => row.collaborators },
    { id: "amount", header: "Valor", numeric: true, cell: (row) => <strong>{money(row.amount)}</strong> },
  ];
  const detailsId = `food-batch-details-${batch.id}`;
  return (
    <Card padding="none" as="article" className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5">
        <CardHeader
          title={batch.administrativeEntity.tradeName}
          description={`cadastro_id: ${batch.administrativeEntity.id} · v${batch.version}`}
          actions={batch.status === "READY" ? <StatusBadge tone="success">Pronto · obrigação separada</StatusBadge> : <StatusBadge tone="warning">Com inconsistências</StatusBadge>}
        />
        <CompetenceSummary
          className="xl:grid-cols-4"
          items={[
            { label: "Valor por colaborador", value: money(batch.unitPrice) },
            { label: "Colaboradores", value: batch.validRows },
            { label: "Total do fornecedor", value: money(batch.totalAmount), emphasis: true },
            { label: "Obrigação", value: batch.financialRecord?.identifier ?? "Não gerada" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setDetails(!details)} variant="secondary" size="sm" aria-expanded={details} aria-controls={detailsId}>
            {details ? "Ocultar rateio" : "Ver rateio"}
          </Button>
          {batch.status === "READY" && (
            <a href={`/api/accounts-payable/food/${batch.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              <Download size={14} aria-hidden="true" />
              Download XLSX
            </a>
          )}
        </div>
        {details && (
          <div id={detailsId} className="grid gap-4 xl:grid-cols-2">
            <DataTable
              caption="Rateio individual"
              captionVisible
              columns={allocationColumns}
              rows={sortedPtBr(batch.allocations, (row) => row.department, (a, b) => comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id))}
              getRowId={(row) => row.id}
              density="dense"
              minWidth="560px"
            />
            <div className="grid content-start gap-3">
              <DataTable caption="Por setor" captionVisible columns={sectorColumns} rows={sectors.map(([sector, value]) => ({ sector, collaborators: value.collaborators.size, amount: value.amount }))} getRowId={(row) => row.sector} density="dense" />
              {batch.issues.map((issue) => (
                <FeedbackAlert key={issue.id} status="warning">Linha {issue.sourceRow ?? "—"}: {issue.message}</FeedbackAlert>
              ))}
            </div>
          </div>
        )}
        <FoodDeletionControls batch={batch} reload={reload} />
      </div>
    </Card>
  );
}

function LocalityPanel({
  locality,
  cycle,
  entities,
  batches,
  prices,
  year,
  month,
  reload,
  selectCompetence,
  onOpenRateio,
}: {
  locality: Locality;
  cycle?: 1 | 2;
  entities: Entity[];
  batches: Batch[];
  prices: Record<string, string>;
  year: number;
  month: number;
  reload: () => Promise<void>;
  selectCompetence: (value: string) => void;
  onOpenRateio: (locality: Locality) => void;
}) {
  const toast = useToast();
  const allowed = sortedPtBr(
    entities.filter((entity) => accepts(entity.locality, locality)),
    (entity) => entity.tradeName || entity.legalName,
    (a, b) => comparePtBr(a.id, b.id),
  );
  const [entityId, setEntityId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<FileInputStatus>("normal");
  const [savingPrice, setSavingPrice] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableEmployees, setAvailableEmployees] = useState<FoodEmployee[]>(
    [],
  );
  const [entryMode, setEntryMode] = useState<"upload" | "manual">("upload");
  const [manualEmployeeIds, setManualEmployeeIds] = useState<string[]>([]);
  const [manualDates, setManualDates] = useState<string[]>([]);
  const [manualQuantities, setManualQuantities] = useState<
    Record<string, string>
  >({});
  const [manualAmount, setManualAmount] = useState("");
  // PA: Emissão NF individual por colaborador (NF 01 → BOINGA, NF 02 → PROJETA no rateio).
  const [manualInvoices, setManualInvoices] = useState<Record<string, FoodPaInvoiceCode | "">>({});
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);
  const paQuantitiesValid =
    manualEmployeeIds.length > 0 &&
    manualEmployeeIds.every(
      (id) =>
        Number.isInteger(Number(manualQuantities[id])) &&
        Number(manualQuantities[id]) >= 1,
    );
  // Todo colaborador do PA entra com ≥ 1 refeição, então a NF é obrigatória para todas as linhas lançadas.
  const paInvoicesValid = manualEmployeeIds.every((id) => isFoodPaInvoiceCode(manualInvoices[id]));
  const manualReady = Boolean(
    entityId &&
    manualEmployeeIds.length &&
    (locality === "PA" ? paQuantitiesValid && paInvoicesValid : manualDates.length > 0) &&
    Number(manualAmount) > 0,
  );
  const manualHint = !entityId
    ? "Selecione o fornecedor para continuar."
    : !manualEmployeeIds.length
      ? "Selecione ao menos um colaborador para continuar."
      : locality === "PA" && !paQuantitiesValid
        ? "Informe a quantidade de refeições de todos os colaboradores."
        : locality === "PA" && !paInvoicesValid
          ? FOOD_PA_INVOICE_REQUIRED_MESSAGE
        : locality === "MA" && !manualDates.length
          ? "Selecione ao menos uma data."
          : !(Number(manualAmount) > 0)
            ? "Informe o valor por refeição para continuar."
            : null;
  const lastDay = new Date(year, month, 0).getDate();
  const dateMin = `${year}-${String(month).padStart(2, "0")}-${String(locality === "MA" && cycle === 2 ? 16 : 1).padStart(2, "0")}`;
  const dateMax = `${year}-${String(month).padStart(2, "0")}-${String(locality === "MA" && cycle === 1 ? 15 : lastDay).padStart(2, "0")}`;
  const occurrenceCount =
    locality === "PA"
      ? manualEmployeeIds.reduce(
          (sum, id) => sum + (Number(manualQuantities[id]) || 0),
          0,
        )
      : manualEmployeeIds.length * manualDates.length;
  const selectedEntity = allowed.find((entity) => entity.id === entityId);
  const restaurantName = selectedEntity
    ? selectedEntity.tradeName?.trim() || selectedEntity.legalName
    : "";
  const resetFoodImportReview = () => {
    setFile(null);
    setFileName("");
    setUploadStatus("normal");
    setError(null);
    setFileInputKey((value) => value + 1);
  };
  useEffect(() => {
    fetch(`/api/accounts-payable/food?year=${year}&month=${month}`)
      .then((response) => response.json())
      .then((body) => setAvailableEmployees(body.employees ?? []))
      .catch(() => undefined);
  }, [year, month]);
  async function savePrice() {
    setSavingPrice(true);
    setError(null);
    try {
      const response = await fetch("/api/accounts-payable/food/price", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          administrativeEntityId: entityId,
          unitPrice,
          year,
          month,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar valor.",
      );
    } finally {
      setSavingPrice(false);
    }
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadStatus("normal");
    setError(null);
    const form = new FormData();
    form.set("year", String(year));
    form.set("month", String(month));
    form.set("locality", locality);
    if (cycle) form.set("cycle", String(cycle));
    form.set("administrativeEntityId", entityId);
    form.set("file", file);
    try {
      const response = await fetch("/api/accounts-payable/food/upload", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setFile(null);
      setUploadStatus("success");
      toast.success(
        "O arquivo foi processado e os rateios foram atualizados.",
        "Arquivo processado com sucesso",
      );
      const importedCompetence = body.batch?.competence
        ? `${body.batch.competence.year}-${String(body.batch.competence.month).padStart(2, "0")}`
        : null;
      if (
        locality === "PA" &&
        importedCompetence &&
        importedCompetence !== `${year}-${String(month).padStart(2, "0")}`
      )
        selectCompetence(importedCompetence);
      else await reload();
    } catch (cause) {
      setUploadStatus("error");
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao processar lote.",
        "Falha no processamento",
      );
    } finally {
      setUploading(false);
    }
  }
  async function saveManual(event: FormEvent) {
    event.preventDefault();
    if (!manualReady) return;
    setUploading(true);
    setError(null);
    setManualSuccess(null);
    try {
      const response = await fetch("/api/accounts-payable/food/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          locality,
          cycle,
          administrativeEntityId: entityId,
          ...(locality === "PA"
            ? {
                collaborators: manualEmployeeIds.map((collaboratorId) => ({
                  collaboratorId,
                  quantity: Number(manualQuantities[collaboratorId]),
                  // só a NF (NF_01/NF_02); a empresa é derivada no servidor
                  invoiceEmission: manualInvoices[collaboratorId],
                })),
              }
            : {
                employeeIds: manualEmployeeIds,
                dates: manualDates,
              }),
          // MA e PA: o servidor usa o valor informado (ver manualFoodUsesSupplierPrice).
          amount: manualAmount,
        }),
      });
      const body = await parseManualFoodResponse(response);
      setManualEmployeeIds([]);
      setManualDates([]);
      setManualQuantities({});
      setManualInvoices({});
      const details = body.duplicateDetails
        .map((item) =>
          item.date
            ? `${item.name ?? "Colaborador"} — ${new Date(`${item.date}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
            : (item.name ?? "Colaborador"),
        )
        .join(", ");
      toast.success(
        body.skipped
          ? `${body.created} lançamento(s), ${body.meals} refeição(ões) adicionada(s). ${body.skipped} já existente(s) ignorado(s)${details ? `: ${details}` : ""}.`
          : locality === "PA"
            ? `${body.created} colaborador(es) · ${body.meals} refeição(ões) adicionada(s) com sucesso.`
            : `${body.created} ocorrência(s) adicionada(s) com sucesso.`,
      );
      await reload();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar as ocorrências.",
        "Não foi possível salvar",
      );
    } finally {
      setUploading(false);
    }
  }
  const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return (
    <Card padding="none" as="section" aria-label={`Alimentação ${locality}`}>
      <div className="grid gap-1 border-b border-border p-4 sm:p-5">
        <CardHeader
          title={locality === "MA" ? "Maranhão" : "Pará"}
          description={
            cycle
              ? cycle === 1
                ? "1º Ciclo · dias 1 a 15. Um lote e uma obrigação por fornecedor."
                : "2º Ciclo · dia 16 ao fim do mês. Um lote e uma obrigação por fornecedor."
              : "Um lote e uma obrigação para cada fornecedor."
          }
          actions={<StatusBadge tone="neutral">{locality}</StatusBadge>}
        />
      </div>
      <Tabs label="Forma de entrada" items={ENTRY_MODES} value={entryMode} onValueChange={(value) => setEntryMode(value as "upload" | "manual")} variant="segmented" className="border-b border-border p-3 sm:px-5">
        <TabPanel value="manual">
          <form
            onSubmit={saveManual}
            className="grid gap-4 pt-3"
            aria-describedby={manualHint ? "manual-food-hint" : undefined}
          >
            <Field label="Fornecedor" required id={`food-supplier-${locality}-${cycle ?? 0}`} helper={`${locality} · Alimentação${cycle ? ` · ${cycle}º Ciclo` : ""}`} className="max-w-xl">
              {(control) => (
                <select
                  {...control}
                  required
                  className={textInputClassName}
                  value={entityId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setEntityId(id);
                    setManualAmount(id ? String(prices[id] ?? "") : "");
                    setManualSuccess(null);
                  }}
                >
                  <option value="">Selecionar cadastro</option>
                  {allowed.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.tradeName || entity.legalName}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <section aria-label="Colaboradores" className="grid gap-3">
              <h3 className="text-card-title text-foreground">Colaboradores</h3>
              <CollaboratorMultiCombobox
                value={manualEmployeeIds}
                options={availableEmployees}
                onChange={(ids) => {
                  setManualEmployeeIds(ids);
                  setManualQuantities((current) =>
                    Object.fromEntries(
                      ids
                        .filter((id) => current[id] !== undefined)
                        .map((id) => [id, current[id]]),
                    ),
                  );
                  setManualInvoices((current) =>
                    Object.fromEntries(
                      ids
                        .filter((id) => current[id] !== undefined)
                        .map((id) => [id, current[id]]),
                    ),
                  );
                  setManualSuccess(null);
                }}
              />
              {locality === "PA" && manualEmployeeIds.length > 0 && (
                <FoodPaManualTable
                  rows={manualEmployeeIds.map((id) => ({ id, employee: availableEmployees.find((item) => item.id === id), quantity: manualQuantities[id] ?? "", invoice: manualInvoices[id] ?? "", subtotal: (Number(manualQuantities[id]) || 0) * Number(manualAmount) }))}
                  onQuantity={(id, value) => {
                    setManualQuantities((current) => ({ ...current, [id]: value }));
                    setManualSuccess(null);
                  }}
                  onInvoice={(id, value) => {
                    setManualInvoices((current) => ({ ...current, [id]: isFoodPaInvoiceCode(value) ? value : "" }));
                    setManualSuccess(null);
                  }}
                />
              )}
            </section>
            <section aria-label="Dados do lançamento" className="grid min-w-0 gap-4 sm:grid-cols-2">
              {locality === "MA" && (
                <Field label="Datas" required helper={`Período permitido: ${formatDate(dateMin)} a ${formatDate(dateMax)}`}>
                  {() => (
                    <MultiDatePicker
                      value={manualDates}
                      onChange={(dates) => {
                        setManualDates(dates);
                        setManualSuccess(null);
                      }}
                      minDate={dateMin}
                      maxDate={dateMax}
                    />
                  )}
                </Field>
              )}
              <Field label="Valor por refeição (R$)" required id={`food-manual-amount-${locality}`} helper="Preenchido com o valor do cadastro do fornecedor; pode ser ajustado neste lançamento.">
                {(control) => (
                  <CurrencyInput
                    {...control}
                    required
                    value={currencyValue(manualAmount)}
                    onValueChange={(value) => {
                      setManualAmount(currencyText(value));
                      setManualSuccess(null);
                    }}
                  />
                )}
              </Field>
              {locality === "PA" && (
                <CalculatedValue label="Restaurante" value={restaurantName || "Selecione o fornecedor"} helper="Obtido automaticamente do Nome Fantasia do cadastro." live />
              )}
            </section>
            {manualEmployeeIds.length > 0 &&
              occurrenceCount > 0 &&
              Number(manualAmount) > 0 && (
                <section aria-label="Resumo do lançamento" className="grid gap-2">
                  <h3 className="text-label text-foreground-muted">Resumo do lançamento</h3>
                  <CompetenceSummary
                    className="xl:grid-cols-5"
                    items={[
                      { label: "Colaboradores", value: manualEmployeeIds.length },
                      ...(locality === "MA" ? [{ label: "Datas", value: manualDates.length }] : []),
                      { label: locality === "PA" ? "Refeições" : "Ocorrências", value: occurrenceCount },
                      { label: "Valor unitário", value: money(manualAmount) },
                      { label: "Valor total", value: money(occurrenceCount * Number(manualAmount)), emphasis: true },
                    ]}
                  />
                </section>
              )}
            {manualSuccess && <FeedbackAlert status="success">{manualSuccess}</FeedbackAlert>}
            {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
            <div className="flex flex-col gap-2 sm:items-end">
              <Button
                type="submit"
                disabled={uploading || !manualReady}
                loading={uploading}
                aura={manualReady}
                className="w-full sm:w-auto sm:min-w-64"
              >
                {locality === "PA"
                  ? `Salvar ${manualEmployeeIds.length} colaborador(es) · ${occurrenceCount} refeições`
                  : occurrenceCount === 1
                    ? "+ Adicionar ocorrência"
                    : `+ Adicionar ${occurrenceCount} ocorrências`}
              </Button>
              {manualHint && (
                <p id="manual-food-hint" className="text-caption text-foreground-muted">
                  {manualHint}
                </p>
              )}
            </div>
          </form>
        </TabPanel>
        <TabPanel value="upload">
          <form onSubmit={upload} className="grid gap-4 pt-3 lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <Field label="Fornecedor" required>
                {(control) => (
                  <select
                    {...control}
                    required
                    value={entityId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setEntityId(id);
                      setUnitPrice(id ? String(prices[id] ?? "") : "");
                    }}
                    className={textInputClassName}
                  >
                    <option value="">Selecionar cadastro</option>
                    {allowed.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.tradeName} — {formatCnpj(entity.cnpj)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Valor por colaborador deste fornecedor (R$)" required className="min-w-48 flex-1">
                  {(control) => <CurrencyInput {...control} required value={currencyValue(unitPrice)} onValueChange={(value) => setUnitPrice(currencyText(value))} />}
                </Field>
                <Button
                  type="button"
                  onClick={savePrice}
                  disabled={savingPrice || uploading || !entityId || !unitPrice}
                  loading={savingPrice}
                  variant="secondary"
                >
                  Salvar valor do fornecedor
                </Button>
              </div>
              <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-muted p-3 text-body sm:flex-row sm:items-center sm:justify-between">
                <span className="text-foreground-muted">
                  Ainda não possui o arquivo? Use a máscara oficial de Alimentação{" "}
                  {locality}.
                </span>
                <a
                  href={`/api/accounts-payable/food/template?locality=${locality}`}
                  download={`Mascara_Alimentacao_${locality}.xlsx`}
                  className={buttonClassName({ variant: "secondary", size: "sm", className: "shrink-0" })}
                >
                  <FileSpreadsheet size={14} aria-hidden="true" />
                  Baixar máscara XLSX
                </a>
              </div>
            </div>
            <div className="grid content-start gap-3">
              <UploadDropzone
                key={fileInputKey}
                label={locality === "PA" ? "RateioOficial (XLSX)" : "Colaboradores (CSV/XLSX)"}
                file={file ? { name: fileName || file.name, size: file.size } : null}
                accept={locality === "PA" ? ".xlsx" : ".csv,.xlsx"}
                disabled={uploading}
                helperText="Até 10 MB. O servidor valida colunas, colaboradores e duplicidades ao processar."
                onFileSelect={(selected) => {
                  setFile(selected);
                  setFileName(selected.name);
                  setUploadStatus("normal");
                  setError(null);
                }}
                onClear={() => {
                  setFile(null);
                  setFileName("");
                  setUploadStatus("normal");
                }}
              />
              {uploadStatus === "success" && !file && <Note tone="success">Último arquivo processado com sucesso.</Note>}
              {uploadStatus === "error" && <Note tone="danger">O último processamento falhou; confira a mensagem e envie novamente.</Note>}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    uploading ||
                    savingPrice ||
                    !entityId ||
                    !file ||
                    !prices[entityId]
                  }
                  loading={uploading}
                  aura
                  className="w-full sm:w-auto sm:min-w-56"
                >
                  {uploading
                    ? "Processando…"
                    : batches.some(
                          (batch) => batch.administrativeEntity.id === entityId,
                        )
                      ? "Enviar nova versão"
                      : "Processar fornecedor"}
                </Button>
              </div>
            </div>
            {error && <FeedbackAlert status="error" className="lg:col-span-2">{error}</FeedbackAlert>}
          </form>
        </TabPanel>
      </Tabs>
      <div className="grid gap-4 p-4 sm:p-5">
        {batches.length ? (
          sortedPtBr(
            batches,
            (batch) =>
              batch.administrativeEntity.tradeName ||
              batch.administrativeEntity.legalName,
            (a, b) => comparePtBr(a.id, b.id),
          ).map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              employees={availableEmployees}
              reload={reload}
              resetImport={resetFoodImportReview}
              onOpenRateio={() => onOpenRateio(locality)}
            />
          ))
        ) : (
          <p className="text-body text-foreground-muted">
            Nenhum fornecedor processado nesta competência.
          </p>
        )}
      </div>
    </Card>
  );
}

function MaCyclePanel(
  props: Omit<
    Parameters<typeof LocalityPanel>[0],
    "locality" | "batches" | "cycle"
  > & { batches: Batch[] },
) {
  const [cycle, setCycle] = useState<1 | 2>(1);
  const current = props.batches.filter((batch) => batch.cycle === cycle);
  const legacy = props.batches.filter((batch) => batch.cycle === 0);
  const ready = current.filter((batch) => batch.status === "READY");
  return (
    <div className="grid min-w-0 gap-4">
      <Tabs label="Ciclo de alimentação do Maranhão" items={CYCLES} value={String(cycle)} onValueChange={(value) => setCycle(Number(value) as 1 | 2)} variant="segmented">
        {([1, 2] as const).map((value) => (
          <TabPanel key={value} value={String(value)} className="mt-3 grid gap-4">
            <CompetenceSummary
              className="xl:grid-cols-4"
              items={[
                { label: "Obrigações", value: ready.length },
                { label: "Colaboradores", value: uniqueCollaborators(ready) },
                { label: "Refeições", value: ready.reduce((sum, batch) => sum + batch.validRows, 0) },
                { label: "Valor do ciclo", value: money(ready.reduce((sum, batch) => sum + Number(batch.totalAmount), 0)), emphasis: true },
              ]}
            />
            <LocalityPanel
              key={`MA-${props.year}-${props.month}-${cycle}`}
              {...props}
              locality="MA"
              cycle={cycle}
              batches={current}
            />
          </TabPanel>
        ))}
      </Tabs>
      {legacy.length > 0 && (
        <Disclosure title={`Histórico mensal anterior aos ciclos (${legacy.length})`} defaultOpen>
          <div className="grid gap-3">
            {sortedPtBr(
              legacy,
              (batch) =>
                batch.administrativeEntity.tradeName ||
                batch.administrativeEntity.legalName,
              (a, b) => comparePtBr(a.id, b.id),
            ).map((batch) => (
              <article key={batch.id} className="grid gap-2 rounded-control border border-border p-3">
                <strong className="text-body">{batch.administrativeEntity.tradeName}</strong>
                <p className="text-caption text-foreground-muted tabular-nums">
                  {batch.validRows} refeições · {money(batch.totalAmount)} ·
                  preservado como lote mensal
                </p>
                <FoodDeletionControls batch={batch} reload={props.reload} />
              </article>
            ))}
          </div>
        </Disclosure>
      )}
    </div>
  );
}

function LocalityTabs({
  entities,
  batches,
  prices,
  year,
  month,
  reload,
  selectCompetence,
  onOpenRateio,
}: {
  entities: Entity[];
  batches: Batch[];
  prices: Record<string, string>;
  year: number;
  month: number;
  reload: () => Promise<void>;
  selectCompetence: (value: string) => void;
  onOpenRateio: (locality: Locality) => void;
}) {
  const [active, setActive] = useState<Locality>("MA");
  // MA e PA ficam montados (keepMounted): trocar de estado não perde o que já foi digitado em cada um.
  const items = (["MA", "PA"] as Locality[]).map((locality) => {
    const stateBatches = batches.filter((batch) => batch.locality === locality);
    const pending = stateBatches.filter((batch) => batch.status !== "READY").length;
    return {
      value: locality,
      label: (
        <span className="inline-flex items-center gap-2">
          {locality === "MA" ? "MA — Maranhão" : "PA — Pará"}
          <span className="rounded-full bg-surface-muted px-1.5 text-caption tabular-nums text-foreground-muted ring-1 ring-inset ring-border" aria-label={`${stateBatches.length} lote(s)`}>{stateBatches.length}</span>
          {pending > 0 && <StatusBadge tone="warning">{pending} pendência(s)</StatusBadge>}
        </span>
      ),
    };
  });
  return (
    <section className="min-w-0" aria-label="Alimentação por estado">
      <Tabs label="Estado do processamento de alimentação" items={items} value={active} onValueChange={(value) => setActive(value as Locality)} variant="segmented">
        <TabPanel value="MA" keepMounted className="mt-4 min-w-0">
          <MaCyclePanel
            entities={entities}
            batches={batches.filter((batch) => batch.locality === "MA")}
            prices={prices}
            year={year}
            month={month}
            reload={reload}
            selectCompetence={selectCompetence}
            onOpenRateio={onOpenRateio}
          />
        </TabPanel>
        <TabPanel value="PA" keepMounted className="mt-4 min-w-0">
          <LocalityPanel
            key={`PA-${year}-${month}`}
            locality="PA"
            entities={entities}
            batches={batches.filter((batch) => batch.locality === "PA")}
            prices={prices}
            year={year}
            month={month}
            reload={reload}
            selectCompetence={selectCompetence}
            onOpenRateio={onOpenRateio}
          />
        </TabPanel>
      </Tabs>
    </section>
  );
}

const RATEIO_GROUPS: Record<Locality, { cycle: number; title: string }[]> = {
  MA: [{ cycle: 1, title: "1º Ciclo · dias 1 a 15" }, { cycle: 2, title: "2º Ciclo · dia 16 ao fim do mês" }, { cycle: 0, title: "Mensal · anterior aos ciclos" }],
  PA: [{ cycle: 0, title: "Competência" }],
};
const cycleLabel = (batch: Batch) => batch.locality === "PA" ? "competência" : batch.cycle === 1 ? "1º ciclo" : batch.cycle === 2 ? "2º ciclo" : "mensal (anterior aos ciclos)";

function FoodAllocationTab({ batches, employees, reload, locality, onLocalityChange }: {
  batches: Batch[];
  employees: FoodEmployee[];
  reload: () => Promise<void>;
  locality: Locality;
  onLocalityChange: (locality: Locality) => void;
}) {
  const ready = batches.filter((batch) => batch.status === "READY");
  const items = (["MA", "PA"] as Locality[]).map((value) => ({
    value,
    // rótulo curto (cabe em 375px): sigla + total do estado; o nome completo fica no título do painel
    label: (
      <span className="inline-flex items-baseline gap-1.5" title={value === "MA" ? "Maranhão" : "Pará"}>
        {value}
        <span className="text-caption tabular-nums text-foreground-muted">{money(ready.filter((batch) => batch.locality === value).reduce((sum, batch) => sum + Number(batch.totalAmount), 0))}</span>
      </span>
    ),
  }));
  return (
    <Tabs label="Rateio por estado" items={items} value={locality} onValueChange={(value) => onLocalityChange(value as Locality)} variant="segmented">
      {(["MA", "PA"] as Locality[]).map((value) => {
        const stateReady = ready.filter((batch) => batch.locality === value);
        const groups = RATEIO_GROUPS[value]
          .map((group) => ({ ...group, batches: sortedPtBr(stateReady.filter((batch) => value === "PA" || batch.cycle === group.cycle), (batch) => batch.administrativeEntity.tradeName || batch.administrativeEntity.legalName, (a, b) => comparePtBr(a.id, b.id)) }))
          .filter((group) => group.batches.length);
        return (
          <TabPanel key={value} value={value} className="mt-4 grid min-w-0 gap-5">
            {groups.length ? groups.map((group) => (
              <section key={group.cycle} aria-label={`Rateio ${value} · ${group.title}`} className="grid gap-3">
                <h3 className="text-card-title text-foreground">{value === "MA" ? "Maranhão" : "Pará"} · {group.title} · {money(group.batches.reduce((sum, batch) => sum + Number(batch.totalAmount), 0))}</h3>
                {group.batches.map((batch) => <BatchCard key={batch.id} batch={batch} employees={employees} reload={reload} resetImport={() => undefined} />)}
              </section>
            )) : (
              <Card><EmptyState title={`Nenhum rateio pronto em ${value === "MA" ? "Maranhão" : "Pará"}`} description="Lotes prontos na Operação aparecem aqui com as perspectivas de rateio, a edição e a exclusão de registros." /></Card>
            )}
          </TabPanel>
        );
      })}
    </Tabs>
  );
}

export default function FoodAccountsPayablePage() {
  const [subsection, setSubsection] = useState<"alimentacao" | "cafe" | "cesta">("alimentacao");
  const now = new Date();
  const [competence, setCompetence] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [entities, setEntities] = useState<Entity[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<FoodEmployee[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [tab, setTab] = useState<BenefitTab>("operacao");
  const [rateioLocality, setRateioLocality] = useState<Locality>("MA");
  const [error, setError] = useState<string | null>(null);
  const [year, month] = competence.split("-").map(Number);
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/accounts-payable/food?year=${year}&month=${month}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setBatches(body.competence?.batches ?? []);
      setPrices(body.supplierPrices ?? {});
      setEmployees(body.employees ?? []);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao carregar competência.",
      );
    }
  }, [year, month]);
  useEffect(() => {
    fetch(`/api/accounts-payable/food?year=${year}&month=${month}`)
      .then((response) => response.json())
      .then((body) => {
        setBatches(body.competence?.batches ?? []);
        setPrices(body.supplierPrices ?? {});
        setEmployees(body.employees ?? []);
        setLoaded(`${year}-${month}`);
      })
      .catch(() => setError("Falha ao carregar competência."));
  }, [year, month]);
  useEffect(() => {
    Promise.all([
      fetch("/api/administrative-entities?q=").then((r) => r.json()),
    ]).then(([entityBody]) => {
      setEntities(
        (entityBody.items ?? []).filter((entity: Entity) =>
          entity.activityArea.toLocaleUpperCase("pt-BR").includes("ALIMENTA"),
        ),
      );
    });
  }, []);

  const ready = batches.filter((batch) => batch.status === "READY");
  const totalPeople = uniqueCollaborators(ready);
  const totalAmount = ready.reduce(
    (sum, batch) => sum + Number(batch.totalAmount),
    0,
  );
  const totalMeals = ready.reduce((sum, batch) => sum + batch.validRows, 0);
  const monthLabel = `${String(month).padStart(2, "0")}/${year}`;
  const openRateio = (locality: Locality) => { setRateioLocality(locality); setTab("rateio"); };
  const historyRows = sortedPtBr(batches, (batch) => `${batch.locality}-${batch.cycle}-${batch.administrativeEntity.tradeName || batch.administrativeEntity.legalName}`, (a, b) => comparePtBr(a.id, b.id)).map((batch) => ({
    id: batch.id,
    title: <span className="inline-flex items-center gap-2"><StatusBadge tone="neutral">{batch.locality}</StatusBadge>{batch.administrativeEntity.tradeName}</span>,
    detail: `${batch.locality === "MA" ? "Maranhão" : "Pará"} · ${cycleLabel(batch)} · ${batch.validRows} refeição(ões)`,
    status: batch.status === "READY" ? { tone: "success" as const, label: "Pronto" } : batch.status === "UNDER_REVIEW" ? { tone: "pending" as const, label: "Em revisão" } : { tone: "warning" as const, label: "Com inconsistências" },
    version: `v${batch.version}`,
    obligation: batch.financialRecord?.identifier ?? null,
    amount: money(batch.totalAmount),
    actions: batch.status === "READY" ? <span className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => openRateio(batch.locality)} aria-label={`Ver rateio de ${batch.administrativeEntity.tradeName} (${batch.locality})`}><ListTree size={14} aria-hidden="true" />Rateio</Button>
      <a href={`/api/accounts-payable/food/${batch.id}/download`} className={buttonClassName({ variant: "ghost", size: "sm" })} aria-label={`Download XLSX de ${batch.administrativeEntity.tradeName} (${batch.locality})`}><Download size={14} aria-hidden="true" />XLSX</a>
    </span> : undefined,
  }));
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader
          backHref="/pagamentos"
          backLabel="Despesas"
          title="Alimentação"
          description="Competência → estado → fornecedor → colaboradores → obrigação individual."
        />
        {/* Subseções (hierarquia Alimentação → Café da Manhã / Cesta Básica): abas do Design System; o conteúdo de cada
            subseção segue o mesmo, só dentro do painel da aba. */}
        <Tabs label="Subseções de Alimentação" items={FOOD_SUBSECTIONS} value={subsection} onValueChange={(value) => setSubsection(value as typeof subsection)}>
        <TabPanel value="alimentacao" className="mt-6 flex flex-col gap-5">
        {subsection === "alimentacao" && (
          <BenefitWorkspace
            title="Alimentação"
            description="Maranhão (ciclos) e Pará: um lote e uma obrigação por fornecedor; o consolidado é só informativo."
            tab={tab}
            onTabChange={setTab}
            context={
              <BenefitCompetenceContext
                id="food-competence"
                competence={competence}
                onCompetenceChange={setCompetence}
                loading={loaded !== `${year}-${month}` && !error}
                actions={ready.length > 0 && (
                  <a
                    href={`/api/accounts-payable/food/consolidated/download?year=${year}&month=${month}`}
                    className={buttonClassName({ variant: "secondary", size: "sm" })}
                  >
                    <Download size={14} aria-hidden="true" />
                    Download consolidado
                  </a>
                )}
                items={[
                  { label: "Competência", value: monthLabel },
                  { label: "Obrigações", value: ready.length, helper: `${batches.length - ready.length} lote(s) pendente(s)` },
                  { label: "Colaboradores", value: totalPeople },
                  { label: "Refeições", value: totalMeals },
                  { label: "Total MA + PA", value: money(totalAmount), helper: "Informativo", emphasis: true },
                ]}
              />
            }
            operation={
              <div className="grid min-w-0 gap-5">
                {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
                <LocalityTabs
                  entities={entities}
                  batches={batches}
                  prices={prices}
                  year={year}
                  month={month}
                  reload={load}
                  selectCompetence={setCompetence}
                  onOpenRateio={openRateio}
                />
                <section aria-labelledby="food-result-title" className="grid gap-3">
                  <div>
                    <h3 id="food-result-title" className="text-card-title text-foreground">Resultado da competência</h3>
                    <p className="text-caption text-foreground-muted">Consolidado informativo: as obrigações permanecem separadas por fornecedor.</p>
                  </div>
                <div className="grid gap-5">
                  {(["MA", "PA"] as Locality[]).map((locality) => {
                    const values = ready.filter(
                      (batch) => batch.locality === locality,
                    );
                    const collaborators = uniqueCollaborators(values);
                    const meals = values.reduce(
                      (sum, batch) => sum + batch.validRows,
                      0,
                    );
                    const localityTotal = values.reduce(
                      (sum, batch) => sum + Number(batch.totalAmount),
                      0,
                    );
                    return (
                      <FoodLocalitySummary
                        key={locality}
                        locality={locality}
                        suppliers={
                          new Set(
                            values.map((batch) => batch.administrativeEntity.id),
                          ).size
                        }
                        collaborators={collaborators}
                        meals={meals}
                        formattedTotal={money(localityTotal)}
                      />
                    );
                  })}
                  <FoodInformativeTotalSummary
                    obligations={ready.length}
                    collaborators={totalPeople}
                    meals={totalMeals}
                    formattedTotal={money(totalAmount)}
                  />
                </div>
                </section>
              </div>
            }
            allocation={<FoodAllocationTab batches={batches} employees={employees} reload={load} locality={rateioLocality} onLocalityChange={setRateioLocality} />}
            history={<BenefitHistory caption={`Lotes de Alimentação · ${monthLabel}`} rows={historyRows} emptyTitle="Nenhum lote nesta competência" emptyDescription="Os lotes de Maranhão e Pará processados na Operação aparecem aqui, identificados por estado e ciclo." />}
          />
        )}
        </TabPanel>
        <TabPanel value="cafe" className="mt-6">{subsection === "cafe" && <BreakfastSection />}</TabPanel>
        <TabPanel value="cesta" className="mt-6">{subsection === "cesta" && <BasicBasketSection />}</TabPanel>
        </Tabs>
      </main>
    </div>
  );
}
