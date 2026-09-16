"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CorporateHeader } from "@/components/CorporateHeader";
import {
  Button,
  DeletionModal,
  FileInput,
  buttonClassName,
  useToast,
  type FileInputStatus,
} from "@/components/ui";
import { formatCnpj } from "@/modules/administrative-entities/schema";
import { FoodMaReview } from "@/modules/accounts-payable/food/ui/FoodMaReview";
import { FoodMaEditor } from "@/modules/accounts-payable/food/ui/FoodMaEditor";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { ManualEntrySection } from "@/components/ManualEntryLayout";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { MultiDatePicker } from "@/components/MultiDatePicker";
import { compareDateThenId, comparePtBr, sortedPtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import {
  FoodInformativeTotalSummary,
  FoodLocalitySummary,
} from "@/modules/accounts-payable/food/ui/FoodLocalitySummary";
import type { FoodBatchStatus } from "@/modules/accounts-payable/food/batch-state";
import { parseManualFoodResponse } from "@/modules/accounts-payable/food/manual-contract";

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
        .replace(/[\u0300-\u036f]/g, "")
        .includes(
          query
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, ""),
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
    <div className="mt-4 border-t border-base-300 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="error"
          size="sm"
          onClick={() => setTarget("batch")}
        >
          Excluir lote
        </Button>
        {batch.mealOccurrences.length > 0 && (
          <span className="text-xs text-secondary">
            O arquivo original será preservado para auditoria.
          </span>
        )}
      </div>
      {batch.mealOccurrences.length > 0 && (
        <details open className="mt-3 rounded-lg border border-base-300">
          <summary className="cursor-pointer p-3 text-sm font-semibold">
            Gerenciar lançamentos e refeições
          </summary>
          <div className="grid gap-3 border-t border-base-300 p-3">
            <input
              className="input input-bordered input-sm w-full"
              placeholder="Filtrar por colaborador, setor ou data"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                className="font-semibold text-primary"
                onClick={() =>
                  setSelected([
                    ...new Set([...selected, ...visible.map((row) => row.id)]),
                  ])
                }
              >
                Selecionar todos os resultados ({visible.length})
              </button>
              {selected.length > 0 && (
                <>
                  <span>{selected.length} selecionado(s)</span>
                  <button
                    type="button"
                    className="text-secondary"
                    onClick={() => setSelected([])}
                  >
                    Limpar seleção
                  </button>
                  <Button
                    type="button"
                    variant="error"
                    size="sm"
                    onClick={() => requestDelete(selected)}
                  >
                    Excluir selecionados
                  </Button>
                </>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {visible.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 border-b border-base-300 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={selected.includes(row.id)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(row.id)
                          ? current.filter((id) => id !== row.id)
                          : [...current, row.id],
                      )
                    }
                    aria-label={`Selecionar ${row.officialName ?? row.receivedName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate">
                      {row.officialName ?? row.receivedName}
                    </strong>
                    <span className="text-xs text-secondary">
                      {row.occurredOn && <>{new Date(row.occurredOn).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · </>}
                      {row.mealQuantity} refeição(ões) · {row.confirmedDepartment ?? row.receivedDepartment} ·{" "}
                      {money(row.amount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-error"
                    onClick={() => requestDelete([row.id])}
                  >
                    Excluir
                  </button>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
      {deleteError && (
        <div role="alert" className="alert alert-error mt-3 text-sm">
          {deleteError}
        </div>
      )}
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
const money = (value: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value),
  );
const uniqueCollaborators = (values: Batch[]) =>
  new Set(
    values.flatMap((batch) =>
      batch.allocations.map(
        (allocation) =>
          allocation.sourceIdentifier ||
          allocation.employeeName
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
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
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-bold">{batch.administrativeEntity.tradeName}</h3>
          <p className="text-xs text-text-muted">
            cadastro_id: {batch.administrativeEntity.id} · v{batch.version}
            {batch.revisions?.length
              ? ` · ${batch.revisions.length} revisão(ões)`
              : ""}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Pronto · Aguardando Financeiro
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <span className="block text-xs text-text-muted">
            Registros importados / válidos
          </span>
          <strong>
            {batch.totalRows} / {batch.validRows}
          </strong>
        </div>
        <div>
          <span className="block text-xs text-text-muted">
            Colaboradores únicos / setores
          </span>
          <strong>
            {batch.allocations.length} / {sectors.size}
          </strong>
        </div>
        <div>
          <span className="block text-xs text-text-muted">
            Refeições · valor unitário
          </span>
          <strong>
            {batch.validRows} · {money(batch.unitPrice)}
          </strong>
        </div>
        <div>
          <span className="block text-xs text-text-muted">
            Total {batch.locality} · obrigação
          </span>
          <strong>
            {money(batch.totalAmount)} · {batch.financialRecord?.identifier}
          </strong>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {[...sectors.entries()]
          .sort(([a], [b]) => comparePtBr(a, b))
          .map(([sector, rows]) => {
            const meals = rows.reduce(
              (sum, row) => sum + Number(row.amount) / Number(row.unitPrice),
              0,
            );
            const amount = rows.reduce(
              (sum, row) => sum + Number(row.amount),
              0,
            );
            return (
              <details key={sector} className="rounded-md border border-border">
                <summary className="cursor-pointer list-none p-4">
                  <strong>{sector}</strong>
                  <span className="ml-3 text-sm text-text-muted">
                    {
                      new Set(
                        rows.map(
                          (row) => row.sourceIdentifier ?? row.employeeName,
                        ),
                      ).size
                    }{" "}
                    colaboradores · {meals} refeições · {money(amount)}
                  </span>
                </summary>
                <div className="border-t border-border p-3">
                  {sortedPtBr(
                    rows,
                    (row) => row.employeeName,
                    (a, b) => comparePtBr(a.id, b.id),
                  ).map((row) => (
                    <div
                      key={row.id}
                      className="flex justify-between border-b py-2 text-sm"
                    >
                      <span>{row.employeeName}</span>
                      <span>
                        {Number(row.amount) / Number(row.unitPrice)} refeições ·{" "}
                        {money(row.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={beginEditing}
          loading={loadingEditor}
          variant="secondary"
          size="sm"
        >
          Editar rateio
        </Button>
        <a
          href={`/api/accounts-payable/food/${batch.id}/download`}
          className={buttonClassName({ variant: "secondary", size: "sm" })}
        >
          Download do rateio XLSX
        </a>
      </div>
      {editorOccurrences && (
        <FoodMaEditor
          batchId={batch.id}
          occurrences={editorOccurrences}
          employees={employees}
          cancel={() => setEditorOccurrences(null)}
          reload={reload}
        />
      )}
      <FoodDeletionControls batch={batch} reload={reload} />
    </article>
  );
}

function BatchCard({
  batch,
  employees,
  reload,
  resetImport,
}: {
  batch: Batch;
  employees: FoodEmployee[];
  reload: () => Promise<void>;
  resetImport: () => void;
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
    return <MaRateio batch={batch} employees={employees} reload={reload} />;
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-bold">{batch.administrativeEntity.tradeName}</h3>
          <p className="text-xs text-text-muted">
            cadastro_id: {batch.administrativeEntity.id} · v{batch.version}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${batch.status === "READY" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
        >
          {batch.status === "READY"
            ? "Pronto · obrigação separada"
            : "Com inconsistências"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <span className="block text-xs text-text-muted">
            Valor por colaborador
          </span>
          <strong>{money(batch.unitPrice)}</strong>
        </div>
        <div>
          <span className="block text-xs text-text-muted">Colaboradores</span>
          <strong>{batch.validRows}</strong>
        </div>
        <div>
          <span className="block text-xs text-text-muted">
            Total do fornecedor
          </span>
          <strong>{money(batch.totalAmount)}</strong>
        </div>
        <div>
          <span className="block text-xs text-text-muted">Obrigação</span>
          <strong>{batch.financialRecord?.identifier ?? "Não gerada"}</strong>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={() => setDetails(!details)}
          variant="secondary"
          size="sm"
        >
          {details ? "Ocultar rateio" : "Ver rateio"}
        </Button>
        {batch.status === "READY" && (
          <a
            href={`/api/accounts-payable/food/${batch.id}/download`}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Download XLSX
          </a>
        )}
      </div>
      {details && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <h4 className="mb-2 font-semibold">Rateio individual</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Colaborador</th>
                  <th className="p-2 text-left">Setor</th>
                  <th className="p-2 text-right">Unitário</th>
                  <th className="p-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {sortedPtBr(
                  batch.allocations,
                  (row) => row.department,
                  (a, b) =>
                    comparePtBr(a.employeeName, b.employeeName) ||
                    comparePtBr(a.id, b.id),
                ).map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">{row.employeeName}</td>
                    <td className="p-2">{row.department}</td>
                    <td className="p-2 text-right">{money(row.unitPrice)}</td>
                    <td className="p-2 text-right">{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="mb-2 font-semibold">Por setor</h4>
            {sectors.map(([sector, value]) => (
              <p key={sector} className="border-b p-2 text-sm">
                {sector}: {value.collaborators.size} · {money(value.amount)}
              </p>
            ))}
            {batch.issues.map((issue) => (
              <p key={issue.id} className="mt-2 text-sm text-amber-800">
                Linha {issue.sourceRow ?? "—"}: {issue.message}
              </p>
            ))}
          </div>
        </div>
      )}
      <FoodDeletionControls batch={batch} reload={reload} />
    </article>
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
  const [manualInvoice, setManualInvoice] = useState("");
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);
  const paQuantitiesValid =
    manualEmployeeIds.length > 0 &&
    manualEmployeeIds.every(
      (id) =>
        Number.isInteger(Number(manualQuantities[id])) &&
        Number(manualQuantities[id]) >= 1,
    );
  const manualReady = Boolean(
    entityId &&
    manualEmployeeIds.length &&
    (locality === "PA" ? paQuantitiesValid : manualDates.length > 0) &&
    Number(manualAmount) > 0,
  );
  const manualHint = !entityId
    ? "Selecione o fornecedor para continuar."
    : !manualEmployeeIds.length
      ? "Selecione ao menos um colaborador para continuar."
      : locality === "PA" && !paQuantitiesValid
        ? "Informe a quantidade de refeições de todos os colaboradores."
        : locality === "MA" && !manualDates.length
          ? "Selecione ao menos uma data."
          : !(Number(manualAmount) > 0)
            ? "Configure o valor do fornecedor para continuar."
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
                })),
              }
            : {
                employeeIds: manualEmployeeIds,
                dates: manualDates,
                amount: manualAmount,
              }),
          invoiceEmission: manualInvoice,
        }),
      });
      const body = await parseManualFoodResponse(response);
      setManualEmployeeIds([]);
      setManualDates([]);
      setManualQuantities({});
      setManualInvoice("");
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
  return (
    <section className="card">
      <div className="border-b border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {locality}
        </p>
        <h2 className="text-lg font-bold">
          {locality === "MA" ? "Maranhão" : "Pará"}
        </h2>
        <p className="text-sm text-text-muted">
          {cycle
            ? cycle === 1
              ? "1º Ciclo · dias 1 a 15. Um lote e uma obrigação por fornecedor."
              : "2º Ciclo · dia 16 ao fim do mês. Um lote e uma obrigação por fornecedor."
            : "Um lote e uma obrigação para cada fornecedor."}
        </p>
      </div>
      <div className="border-b border-border bg-base-200/60 p-2">
        <div
          role="tablist"
          aria-label="Forma de entrada"
          className="grid grid-cols-2 rounded-lg border border-base-300 bg-base-100 p-1"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={entryMode === "upload"}
            variant={entryMode === "upload" ? "primary" : "ghost"}
            onClick={() => setEntryMode("upload")}
            className="border-0"
          >
            Upload de arquivo
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={entryMode === "manual"}
            variant={entryMode === "manual" ? "primary" : "ghost"}
            onClick={() => setEntryMode("manual")}
            className="border-0"
          >
            Lançamento manual
          </Button>
        </div>
      </div>
      {entryMode === "manual" && (
        <form
          onSubmit={saveManual}
          className="grid gap-5 border-b border-border p-4 sm:p-5"
          aria-describedby={manualHint ? "manual-food-hint" : undefined}
        >
          <ManualEntrySection eyebrow="1. Contexto" title="Dados do lançamento">
            <label
              htmlFor={`food-supplier-${locality}-${cycle ?? 0}`}
              className="form-control"
            >
              <span className="label-text mb-1">Fornecedor *</span>
              <select
                id={`food-supplier-${locality}-${cycle ?? 0}`}
                required
                className="select select-bordered w-full"
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
              <span className="mt-2 text-xs text-secondary">
                {locality} · Alimentação{cycle ? ` · ${cycle}º Ciclo` : ""}
              </span>
            </label>
          </ManualEntrySection>
          <ManualEntrySection eyebrow="2. Pessoas" title="Colaboradores">
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
                setManualSuccess(null);
              }}
            />
            {locality === "PA" && manualEmployeeIds.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-base-300">
                <div className="hidden grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_120px_130px] gap-3 bg-base-200 px-3 py-2 text-xs font-semibold uppercase sm:grid">
                  <span>Colaborador</span>
                  <span>Departamento</span>
                  <span>Refeições</span>
                  <span>Subtotal</span>
                </div>
                {manualEmployeeIds.map((id) => {
                  const employee = availableEmployees.find(
                    (item) => item.id === id,
                  );
                  const quantity = Number(manualQuantities[id]) || 0;
                  return (
                    <div
                      key={id}
                      className="grid gap-2 border-t border-base-300 p-3 first:border-t-0 sm:grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_120px_130px] sm:items-center"
                    >
                      <div className="min-w-0">
                        <strong className="block truncate">
                          {employee?.officialName}
                        </strong>
                        <span className="text-xs text-secondary sm:hidden">
                          {employee?.department}
                        </span>
                      </div>
                      <span className="hidden truncate text-sm sm:block">
                        {employee?.department}
                      </span>
                      <label className="text-xs">
                        <span className="sm:sr-only">
                          Quantidade de refeições
                        </span>
                        <input
                          required
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          className="input input-bordered input-sm w-full"
                          value={manualQuantities[id] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setManualQuantities((current) => ({
                              ...current,
                              [id]: value,
                            }));
                            setManualSuccess(null);
                          }}
                          placeholder="Qtd."
                          aria-label={`Quantidade de refeições de ${employee?.officialName ?? "colaborador"}`}
                        />
                        {manualQuantities[id] !== undefined &&
                          !Number.isInteger(Number(manualQuantities[id])) && (
                            <small className="text-error">
                              Informe um inteiro.
                            </small>
                          )}
                      </label>
                      <strong className="text-sm">
                        {money(quantity * Number(manualAmount))}
                      </strong>
                    </div>
                  );
                })}
              </div>
            )}
          </ManualEntrySection>
          <ManualEntrySection
            eyebrow="3. Lançamento"
            title="Dados do lançamento"
          >
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {locality === "MA" && (
                <label className="form-control">
                  <span className="label-text mb-1">Datas *</span>
                  <MultiDatePicker
                    value={manualDates}
                    onChange={(dates) => {
                      setManualDates(dates);
                      setManualSuccess(null);
                    }}
                    minDate={dateMin}
                    maxDate={dateMax}
                  />
                  <span className="mt-1 text-xs text-secondary">
                    Período permitido:{" "}
                    {new Date(`${dateMin}T00:00:00Z`).toLocaleDateString(
                      "pt-BR",
                      { timeZone: "UTC" },
                    )}{" "}
                    a{" "}
                    {new Date(`${dateMax}T00:00:00Z`).toLocaleDateString(
                      "pt-BR",
                      { timeZone: "UTC" },
                    )}
                  </span>
                </label>
              )}
              <label
                htmlFor={`food-manual-amount-${locality}`}
                className="form-control"
              >
                <span className="label-text mb-1">Valor por refeição *</span>
                <input
                  id={`food-manual-amount-${locality}`}
                  required
                  readOnly={locality === "PA"}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  className="input input-bordered w-full"
                  value={manualAmount}
                  onChange={(e) => {
                    setManualAmount(e.target.value);
                    setManualSuccess(null);
                  }}
                />
                <span className="mt-1 text-xs text-secondary">
                  Valor unitário do cadastro do fornecedor.
                </span>
              </label>
              {locality === "PA" && (
                <>
                  <div className="form-control">
                    <span className="label-text mb-1">Restaurante</span>
                    <div
                      className="rounded-md border border-base-300 bg-base-200 px-3 py-2 text-sm"
                      aria-live="polite"
                    >
                      {restaurantName || "Selecione o fornecedor"}
                    </div>
                    <span className="mt-1 text-xs text-secondary">
                      Obtido automaticamente do Nome Fantasia do cadastro.
                    </span>
                  </div>
                  <label htmlFor="food-manual-invoice" className="form-control">
                    <span className="label-text mb-1">Emissão NF</span>
                    <input
                      id="food-manual-invoice"
                      className="input input-bordered w-full"
                      placeholder="Ex.: NF 01"
                      value={manualInvoice}
                      onChange={(e) => setManualInvoice(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </ManualEntrySection>
          {manualEmployeeIds.length > 0 &&
            occurrenceCount > 0 &&
            Number(manualAmount) > 0 && (
              <section
                aria-label="Resumo do lançamento"
                className="rounded-lg border border-base-300 bg-base-200/60 p-4 text-sm"
              >
                <strong className="block">Resumo do lançamento</strong>
                <p className="mt-2">
                  {manualEmployeeIds.length} colaborador(es)
                </p>
                {locality === "MA" && <p>{manualDates.length} data(s)</p>}
                <p>
                  {occurrenceCount}{" "}
                  {locality === "PA" ? "refeições" : "ocorrências"}
                </p>
                <p>Valor unitário: {money(manualAmount)}</p>
                <p className="mt-2 text-base">
                  <strong>
                    Valor total ·{" "}
                    {money(occurrenceCount * Number(manualAmount))}
                  </strong>
                </p>
              </section>
            )}
          {manualSuccess && (
            <div role="status" className="alert alert-success text-sm">
              {manualSuccess}
            </div>
          )}
          {error && (
            <div role="alert" className="alert alert-error text-sm">
              {error}
            </div>
          )}
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
              <p id="manual-food-hint" className="text-xs text-secondary">
                {manualHint}
              </p>
            )}
          </div>
        </form>
      )}
      {entryMode === "upload" && (
        <>
          <form
            onSubmit={upload}
            className="grid gap-3 border-b border-border p-5 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Fornecedor *</span>
              <select
                required
                value={entityId}
                onChange={(event) => {
                  const id = event.target.value;
                  setEntityId(id);
                  setUnitPrice(id ? String(prices[id] ?? "") : "");
                }}
                className="rounded-md border border-border px-3 py-2"
              >
                <option value="">Selecionar cadastro</option>
                {allowed.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.tradeName} — {formatCnpj(entity.cnpj)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Valor por colaborador deste fornecedor *</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                className="rounded-md border border-border px-3 py-2"
              />
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={savePrice}
                disabled={savingPrice || uploading || !entityId || !unitPrice}
                loading={savingPrice}
                variant="primary"
                className="w-full"
              >
                Salvar valor do fornecedor
              </Button>
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-border bg-background-muted p-3 text-sm sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-text-muted">
                Ainda não possui o arquivo? Use a máscara oficial de Alimentação{" "}
                {locality}.
              </span>
              <a
                href={`/api/accounts-payable/food/template?locality=${locality}`}
                download={`Mascara_Alimentacao_${locality}.xlsx`}
                className={buttonClassName({
                  variant: "secondary",
                  size: "sm",
                  className: "shrink-0",
                })}
              >
                Baixar máscara XLSX
              </a>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span>
                {locality === "PA"
                  ? "RateioOficial (XLSX) *"
                  : "Colaboradores (CSV/XLSX) *"}
              </span>
              <FileInput
                key={fileInputKey}
                required
                accept={locality === "PA" ? ".xlsx" : ".csv,.xlsx"}
                fileName={fileName}
                loading={uploading}
                status={uploadStatus === "loading" ? "normal" : uploadStatus}
                disabled={uploading}
                aria-label={
                  locality === "PA"
                    ? "Selecionar RateioOficial"
                    : "Selecionar arquivo de colaboradores"
                }
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setFileName(selected?.name ?? "");
                  setUploadStatus("normal");
                  setError(null);
                }}
              />
            </label>
            <div className="flex items-end">
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
                className="w-full"
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
            {error && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
                {error}
              </p>
            )}
          </form>
        </>
      )}
      <div className="grid gap-4 p-5">
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
            />
          ))
        ) : (
          <p className="text-sm text-text-muted">
            Nenhum fornecedor processado nesta competência.
          </p>
        )}
      </div>
    </section>
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
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label="Ciclo de alimentação do Maranhão"
        className="grid grid-cols-2 gap-2 border-x border-border bg-base-200 p-3"
      >
        {([1, 2] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={cycle === value}
            onClick={() => setCycle(value)}
            className={`rounded-md px-4 py-3 text-left transition ${cycle === value ? "bg-primary text-white shadow-sm" : "border border-base-300 bg-base-100 text-neutral hover:border-primary"}`}
          >
            <strong>{value}º Ciclo</strong>
            <span className="block text-xs opacity-80">
              {value === 1 ? "Dias 1 a 15" : "Dia 16 ao fim do mês"}
            </span>
          </button>
        ))}
      </div>
      <div className="border-x border-border bg-base-200 px-3 pb-3">
        <div className="grid grid-cols-2 gap-3 rounded-md border border-base-300 bg-base-100 p-3 text-sm sm:grid-cols-4">
          <span>
            <b>{ready.length}</b>
            <small className="block text-secondary">obrigações</small>
          </span>
          <span>
            <b>{uniqueCollaborators(ready)}</b>
            <small className="block text-secondary">colaboradores</small>
          </span>
          <span>
            <b>{ready.reduce((sum, batch) => sum + batch.validRows, 0)}</b>
            <small className="block text-secondary">refeições</small>
          </span>
          <span>
            <b>
              {money(
                ready.reduce(
                  (sum, batch) => sum + Number(batch.totalAmount),
                  0,
                ),
              )}
            </b>
            <small className="block text-secondary">valor do ciclo</small>
          </span>
        </div>
      </div>
      <LocalityPanel
        key={`MA-${props.year}-${props.month}-${cycle}`}
        {...props}
        locality="MA"
        cycle={cycle}
        batches={current}
      />
      {legacy.length > 0 && (
        <details
          open
          className="mt-4 rounded-lg border border-border bg-base-100 p-4"
        >
          <summary className="cursor-pointer font-semibold">
            Histórico mensal anterior aos ciclos ({legacy.length})
          </summary>
          <div className="mt-4 grid gap-3">
            {sortedPtBr(
              legacy,
              (batch) =>
                batch.administrativeEntity.tradeName ||
                batch.administrativeEntity.legalName,
              (a, b) => comparePtBr(a.id, b.id),
            ).map((batch) => (
              <article
                key={batch.id}
                className="rounded-md border border-border p-3"
              >
                <strong>{batch.administrativeEntity.tradeName}</strong>
                <p className="text-sm text-secondary">
                  {batch.validRows} refeições · {money(batch.totalAmount)} ·
                  preservado como lote mensal
                </p>
                <FoodDeletionControls batch={batch} reload={props.reload} />
              </article>
            ))}
          </div>
        </details>
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
}: {
  entities: Entity[];
  batches: Batch[];
  prices: Record<string, string>;
  year: number;
  month: number;
  reload: () => Promise<void>;
  selectCompetence: (value: string) => void;
}) {
  const [active, setActive] = useState<Locality>("MA");
  return (
    <section className="min-w-0">
      <div
        role="tablist"
        aria-label="Estado do processamento de alimentação"
        className="grid grid-cols-2 rounded-t-lg border border-border bg-white p-1 sm:flex sm:w-fit"
      >
        {(["MA", "PA"] as Locality[]).map((locality) => {
          const stateBatches = batches.filter(
            (batch) => batch.locality === locality,
          );
          const pending = stateBatches.filter(
            (batch) => batch.status !== "READY",
          ).length;
          const selected = active === locality;
          return (
            <button
              key={locality}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(locality)}
              className={`min-w-0 rounded-md px-4 py-3 text-left transition sm:min-w-52 ${selected ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-primary/5 hover:text-primary"}`}
            >
              <span className="flex items-center justify-between gap-10">
                <strong>
                  {locality === "MA" ? "MA — Maranhão" : "PA — Pará"}
                </strong>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-slate-100"}`}
                >
                  {stateBatches.length}
                </span>
              </span>
              {pending > 0 && (
                <span
                  className={`mt-1 block text-xs ${selected ? "text-white/80" : "text-amber-700"}`}
                >
                  {pending} pendência(s)
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="min-w-0">
        {(["MA", "PA"] as Locality[]).map((locality) => (
          <div
            key={locality}
            role="tabpanel"
            hidden={active !== locality}
            className="min-w-0 [&>.card]:rounded-tl-none"
          >
            {locality === "MA" ? (
              <MaCyclePanel
                entities={entities}
                batches={batches.filter((batch) => batch.locality === "MA")}
                prices={prices}
                year={year}
                month={month}
                reload={reload}
                selectCompetence={selectCompetence}
              />
            ) : (
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
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function FoodAccountsPayablePage() {
  const router = useRouter();
  const now = new Date();
  const [competence, setCompetence] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [email, setEmail] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
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
      })
      .catch(() => setError("Falha ao carregar competência."));
  }, [year, month]);
  useEffect(() => {
    Promise.all([
      fetch("/api/administrative-entities?q=").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]).then(([entityBody, me]) => {
      setEntities(
        (entityBody.items ?? []).filter((entity: Entity) =>
          entity.activityArea.toLocaleUpperCase("pt-BR").includes("ALIMENTA"),
        ),
      );
      setEmail(me.email ?? null);
    });
  }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const ready = batches.filter((batch) => batch.status === "READY");
  const totalPeople = uniqueCollaborators(ready);
  const totalAmount = ready.reduce(
    (sum, batch) => sum + Number(batch.totalAmount),
    0,
  );
  const totalMeals = ready.reduce((sum, batch) => sum + batch.validRows, 0);
  return (
    <div className="flex flex-1 flex-col">
      <CorporateHeader currentUserEmail={email} onLogout={logout} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <Link
            href="/pagamentos"
            className="text-sm font-semibold text-primary"
          >
            ← Contas a pagar
          </Link>
          <h1 className="mt-4 text-2xl font-bold">
            Alimentação por fornecedor
          </h1>
          <p className="text-sm text-text-muted">
            Competência → estado → fornecedor → colaboradores → obrigação
            individual.
          </p>
        </div>
        <section className="card p-5">
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            <span>Competência</span>
            <input
              type="month"
              value={competence}
              onChange={(event) => setCompetence(event.target.value)}
              className="rounded-md border border-border px-3 py-2"
            />
          </label>
        </section>
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <LocalityTabs
          entities={entities}
          batches={batches}
          prices={prices}
          year={year}
          month={month}
          reload={load}
          selectCompetence={setCompetence}
        />
        <section className="card p-5">
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Resumo
              </p>
              <h2 className="text-lg font-bold">Consolidado informativo</h2>
              <p className="text-sm text-text-muted">
                As obrigações permanecem separadas por fornecedor.
              </p>
            </div>
            {ready.length > 0 && (
              <a
                href={`/api/accounts-payable/food/consolidated/download?year=${year}&month=${month}`}
                className={buttonClassName({
                  variant: "secondary",
                  size: "sm",
                  className: "self-start",
                })}
              >
                Download consolidado
              </a>
            )}
          </div>
          <div className="mt-5 grid gap-6">
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
      </main>
    </div>
  );
}
