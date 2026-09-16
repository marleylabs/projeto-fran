"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { compareDateThenId, comparePtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";

type Employee = { id: string; officialName: string; department: string };
type Occurrence = {
  id: string;
  sourceRow: number;
  occurredOn: string | null;
  mealQuantity: number;
  receivedName: string;
  receivedDepartment: string;
  employeeId: string | null;
  officialName: string | null;
  confirmedDepartment: string | null;
  disposition: "VALID" | "DUPLICATE" | "IGNORED";
  matchMethod: string;
  duplicateCandidate?: boolean;
  invoiceEmission?: string | null;
  restaurantName?: string | null;
  amount?: string;
};
type Value = {
  employeeId: string;
  officialName: string;
  department: string;
  disposition: Occurrence["disposition"];
  mealQuantity: number;
  saveAlias: boolean;
};
type StatusFilter = "ALL" | "OK" | "FUZZY" | "ALIAS" | "PENDING" | "DUPLICATE";
type Sort = "PRIORITY" | "NAME" | "DEPARTMENT" | "DATE";
const PAGE_SIZE = 50;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
const statusInfo = (row: Occurrence, value: Value) => {
  if (value.disposition === "DUPLICATE" || row.duplicateCandidate)
    return {
      key: "DUPLICATE",
      label: "⚠ Possível duplicidade",
      priority: 1,
      color: "bg-amber-100 text-amber-900",
    };
  if (row.matchMethod === "UNMATCHED" || !value.employeeId)
    return {
      key: "PENDING",
      label: "⚠ Revisar",
      priority: 0,
      color: "bg-red-100 text-red-800",
    };
  if (row.matchMethod === "FUZZY")
    return {
      key: "FUZZY",
      label: "↻ Corrigido automaticamente",
      priority: 2,
      color: "bg-blue-100 text-blue-800",
    };
  if (row.matchMethod === "ALIAS")
    return {
      key: "ALIAS",
      label: "Alias conhecido",
      priority: 2,
      color: "bg-violet-100 text-violet-800",
    };
  if (row.matchMethod === "MANUAL")
    return {
      key: "OK",
      label: "✓ Corrigido",
      priority: 3,
      color: "bg-emerald-100 text-emerald-800",
    };
  return {
    key: "OK",
    label: "✓ Identificado",
    priority: 3,
    color: "bg-emerald-100 text-emerald-800",
  };
};

function EmployeeCombobox({
  value,
  department,
  employees,
  onChange,
  onNew,
}: {
  value: string;
  department: string;
  employees: Employee[];
  onChange: (employee: Employee) => void;
  onNew: (name: string) => void;
}) {
  const selected = employees.find((employee) => employee.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allDepartments, setAllDepartments] = useState(false);
  const options = useMemo(
    () =>
      employees
        .filter(
          (employee) =>
            (allDepartments ||
              normalize(employee.department) === normalize(department)) &&
            normalize(employee.officialName).includes(normalize(query)),
        )
        .sort(
          (a, b) =>
            comparePtBr(a.officialName, b.officialName) ||
            comparePtBr(a.department, b.department) ||
            comparePtBr(a.id, b.id),
        )
        .slice(0, 30),
    [allDepartments, department, employees, query],
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-left"
      >
        <span className={selected ? "" : "text-text-muted"}>
          {selected?.officialName ?? "Buscar colaborador…"}
        </span>
        <span aria-hidden>⌄</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-64 rounded-md border border-border bg-white p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar colaborador..."
            className="w-full rounded-md border border-border px-3 py-2"
          />
          <p className="mt-2 px-2 text-xs font-semibold text-text-muted">
            {allDepartments ? "Todos os setores" : department || "Mesmo setor"}
          </p>
          <div className="mt-1 max-h-52 overflow-y-auto">
            {options.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => {
                  onChange(employee);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full rounded px-2 py-2 text-left hover:bg-primary/10"
              >
                <strong className="block text-sm">
                  {employee.officialName}
                </strong>
                <span className="text-xs text-text-muted">
                  {employee.department}
                </span>
              </button>
            ))}
            {!options.length && (
              <p className="p-2 text-sm text-text-muted">
                Nenhum colaborador encontrado.
              </p>
            )}
          </div>
          <div className="mt-2 grid gap-1 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => setAllDepartments((current) => !current)}
              className="rounded px-2 py-1 text-left text-xs font-semibold text-primary"
            >
              {allDepartments
                ? "Priorizar o mesmo setor"
                : "Buscar em todos os setores"}
            </button>
            {query.trim() && (
              <button
                type="button"
                onClick={() => {
                  onNew(query.trim());
                  setOpen(false);
                }}
                className="rounded px-2 py-1 text-left text-xs font-semibold text-primary"
              >
                Usar “{query.trim()}” como nome corrigido
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FoodMaEditor({
  batchId,
  occurrences,
  employees,
  cancel,
  reload,
}: {
  batchId: string;
  occurrences: Occurrence[];
  employees: Employee[];
  cancel: () => void;
  reload: () => Promise<void>;
}) {
  const initial = useMemo(
    () =>
      Object.fromEntries(
        occurrences.map((row) => [
          row.id,
          {
            employeeId: row.employeeId ?? "",
            officialName: row.officialName ?? row.receivedName,
            department: normalizeOrganizationalValue(row.confirmedDepartment ?? row.receivedDepartment),
            disposition: row.disposition ?? "VALID",
            mealQuantity: row.mealQuantity,
            saveAlias: false,
          } satisfies Value,
        ]),
      ),
    [occurrences],
  );
  const [values, setValues] = useState<Record<string, Value>>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("PRIORITY");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);
  const update = (id: string, patch: Partial<Value>) =>
    setValues((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  const departments = useMemo(
    () =>
      [
        ...new Set(
          occurrences
            .map((row) => values[row.id]?.department || row.receivedDepartment)
            .filter(Boolean),
        ),
      ].sort(comparePtBr),
    [occurrences, values],
  );
  const counts = useMemo(
    () =>
      occurrences.reduce(
        (result, row) => {
          const key = statusInfo(row, values[row.id]).key;
          result[key] = (result[key] ?? 0) + 1;
          return result;
        },
        {} as Record<string, number>,
      ),
    [occurrences, values],
  );
  const filtered = useMemo(
    () =>
      occurrences
        .filter((row) => {
          const value = values[row.id];
          const info = statusInfo(row, value);
          const date = row.occurredOn ? new Date(row.occurredOn).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Sem data individual";
          const matchesQuery =
            !query ||
            normalize(
              [
                row.receivedName,
                value.officialName,
                value.department,
                row.receivedDepartment,
                date,
              ].join(" "),
            ).includes(normalize(query));
          return (
            matchesQuery &&
            (department === "ALL" || value.department === department) &&
            (status === "ALL" || info.key === status) &&
            (!pendingOnly || info.key === "PENDING" || info.key === "DUPLICATE")
          );
        })
        .sort((a, b) => {
          const nameComparison = comparePtBr(
            values[a.id].officialName || a.receivedName,
            values[b.id].officialName || b.receivedName,
          );
          const dateComparison = compareDateThenId(
            a.occurredOn,
            b.occurredOn,
            a.id,
            b.id,
          );
          if (sort === "NAME")
            return nameComparison || dateComparison;
          if (sort === "DEPARTMENT")
            return (
              comparePtBr(
                values[a.id].department,
                values[b.id].department,
              ) || nameComparison || dateComparison
            );
          if (sort === "DATE")
            return dateComparison || nameComparison;
          return (
            statusInfo(a, values[a.id]).priority -
              statusInfo(b, values[b.id]).priority ||
            nameComparison ||
            dateComparison
          );
        }),
    [department, occurrences, pendingOnly, query, sort, status, values],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filtersActive = Boolean(
    queryInput || department !== "ALL" || status !== "ALL" || pendingOnly,
  );
  const clearFilters = () => {
    setQueryInput("");
    setQuery("");
    setDepartment("ALL");
    setStatus("ALL");
    setPendingOnly(false);
    setPage(1);
  };
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/accounts-payable/food/${batchId}/edit`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edits: occurrences.map((row) => ({
              occurrenceId: row.id,
              ...values[row.id],
            })),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await reload();
      cancel();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao atualizar rateio.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 min-w-0 rounded-lg border border-primary/30 bg-primary/5">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-bold">Editar ocorrências do rateio</h4>
            <p className="text-sm text-text-muted">
              Central de revisão. As alterações ficam locais até você salvar e
              recalcular.
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Fechar editor
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setStatus("ALL");
              setPendingOnly(false);
            }}
            className="rounded-md border border-border bg-white p-3 text-left"
          >
            <strong className="block text-xl">{occurrences.length}</strong>
            <span className="text-xs text-text-muted">
              Todas as ocorrências
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatus("FUZZY");
              setPendingOnly(false);
            }}
            className="rounded-md border border-blue-200 bg-blue-50 p-3 text-left"
          >
            <strong className="block text-xl">{counts.FUZZY ?? 0}</strong>
            <span className="text-xs text-blue-800">
              Corrigidas automaticamente
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatus("ALL");
              setPendingOnly(true);
            }}
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-left"
          >
            <strong className="block text-xl">
              {(counts.PENDING ?? 0) + (counts.DUPLICATE ?? 0)}
            </strong>
            <span className="text-xs text-amber-900">Precisam de revisão</span>
          </button>
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,2fr)_1fr_1fr_1fr]">
          <label className="relative">
            <span className="sr-only">Buscar</span>
            <span className="pointer-events-none absolute left-3 top-2.5">
              ⌕
            </span>
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Buscar colaborador, nome recebido ou setor..."
              className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3"
            />
          </label>
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="min-w-0 rounded-md border border-border bg-white px-3 py-2"
          >
            <option value="ALL">Todos os setores</option>
            {departments.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="min-w-0 rounded-md border border-border bg-white px-3 py-2"
          >
            <option value="ALL">Todas as situações</option>
            <option value="OK">OK</option>
            <option value="FUZZY">Corrigido automaticamente</option>
            <option value="ALIAS">Alias conhecido</option>
            <option value="PENDING">Revisão necessária</option>
            <option value="DUPLICATE">Possível duplicidade</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="min-w-0 rounded-md border border-border bg-white px-3 py-2"
          >
            <option value="PRIORITY">Pendências primeiro</option>
            <option value="NAME">Ordenar por nome</option>
            <option value="DEPARTMENT">Ordenar por setor</option>
            <option value="DATE">Ordenar por data</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(event) => setPendingOnly(event.target.checked)}
            />
            Mostrar somente pendências
          </label>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-primary"
            >
              Limpar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-text-muted">
            {filtered.length} registro(s)
          </span>
        </div>
      </div>
      <div className="border-y border-border bg-white">
        <div className="hidden grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.5fr)_minmax(110px,1fr)_auto_auto] gap-3 border-b border-border px-5 py-3 text-xs font-semibold uppercase text-text-muted lg:grid">
          <span>Origem</span>
          <span>Colaborador identificado</span>
          <span>Setor</span>
          <span>Situação</span>
          <span>Ação</span>
        </div>
        {visible.length ? (
          visible.map((row) => {
            const value = values[row.id];
            const info = statusInfo(row, value);
            const isEditing = editingId === row.id;
            return (
              <article
                key={row.id}
                className="border-b border-border p-4 last:border-b-0 sm:p-5"
              >
                <div className="grid min-w-0 items-center gap-3 lg:grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.5fr)_minmax(110px,1fr)_auto_auto]">
                  <div className="min-w-0">
                    <strong className="block truncate">
                      {row.receivedName}
                    </strong>
                    <span className="text-xs text-text-muted">
                      Linha {row.sourceRow} ·{" "}
                      {row.occurredOn ? new Date(row.occurredOn).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : `${row.mealQuantity} refeições`}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-text-muted lg:hidden">
                      Colaborador identificado
                    </span>
                    <strong className="block truncate">
                      {value.officialName || "Não identificado"}
                    </strong>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-text-muted lg:hidden">
                      Setor
                    </span>
                    <span className="block truncate">{value.department}</span>
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${info.color}`}
                  >
                    {info.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : row.id)}
                    className="w-fit rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary"
                  >
                    {isEditing
                      ? "Fechar"
                      : info.key === "PENDING" || info.key === "DUPLICATE"
                        ? "Revisar"
                        : "Editar"}
                  </button>
                </div>
                {isEditing && (
                  <div className="mt-4 grid gap-3 rounded-md border border-border bg-slate-50 p-4 md:grid-cols-2">
                    <div className="rounded-md bg-white p-3 text-sm">
                      <span className="block text-xs text-text-muted">
                        Nome recebido — somente auditoria
                      </span>
                      <strong>{row.receivedName}</strong>
                      <p className="text-xs text-text-muted">
                        Setor recebido: {row.receivedDepartment}
                      </p>
                      {row.invoiceEmission && (
                        <p className="text-xs text-text-muted">
                          {row.invoiceEmission} · {row.restaurantName} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(row.amount))}
                        </p>
                      )}
                    </div>
                    <label className="text-sm">
                      <span className="mb-1 block">Colaborador</span>
                      <EmployeeCombobox
                        value={value.employeeId}
                        department={value.department}
                        employees={employees}
                        onChange={(employee) =>
                          update(row.id, {
                            employeeId: employee.id,
                            officialName: employee.officialName,
                          })
                        }
                        onNew={(name) =>
                          update(row.id, { employeeId: "", officialName: name })
                        }
                      />
                    </label>
                    {!value.employeeId && (
                      <label className="text-sm">
                        <span className="mb-1 block">Nome corrigido</span>
                        <input
                          value={value.officialName}
                          onChange={(event) =>
                            update(row.id, { officialName: event.target.value })
                          }
                          className="w-full rounded-md border border-border bg-white px-3 py-2"
                        />
                      </label>
                    )}
                    <label className="text-sm">
                      <span className="mb-1 block">Setor confirmado</span>
                      <input
                        value={value.department}
                        onChange={(event) =>
                          update(row.id, { department: normalizeOrganizationalValue(event.target.value) })
                        }
                        className="w-full rounded-md border border-border bg-white px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block">Situação da ocorrência</span>
                      <select
                        value={value.disposition}
                        onChange={(event) =>
                          update(row.id, {
                            disposition: event.target
                              .value as Value["disposition"],
                          })
                        }
                        className="w-full rounded-md border border-border bg-white px-3 py-2"
                      >
                        <option value="VALID">Válida</option>
                        <option value="DUPLICATE">Duplicada</option>
                        <option value="IGNORED">Ignorada</option>
                      </select>
                    </label>
                    {!row.occurredOn && <label className="text-sm"><span className="mb-1 block">Quantidade de refeições</span><input type="number" min="1" step="1" value={value.mealQuantity} onChange={event=>update(row.id,{mealQuantity:Number(event.target.value)})} className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={value.saveAlias}
                        onChange={(event) =>
                          update(row.id, { saveAlias: event.target.checked })
                        }
                      />
                      Salvar nome recebido como alias
                    </label>
                    <div className="flex justify-end md:col-span-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
                      >
                        Aplicar localmente
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="p-10 text-center">
            <strong>Nenhum registro encontrado.</strong>
            <p className="mt-1 text-sm text-text-muted">
              Tente alterar a busca ou remover os filtros.
            </p>
            <Button
              type="button"
              onClick={clearFilters}
              variant="secondary"
              size="sm"
              className="mt-3"
            >
              Limpar filtros
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span>
          Mostrando {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
          {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
            variant="secondary"
            size="sm"
          >
            Anterior
          </Button>
          <span>
            Página {page} de {totalPages}
          </span>
          <Button
            type="button"
            disabled={page === totalPages}
            onClick={() => setPage((current) => current + 1)}
            variant="secondary"
            size="sm"
          >
            Próximo
          </Button>
        </div>
      </div>
      {error && (
        <p className="mx-4 mb-3 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white/95 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
        <Button
          type="button"
          onClick={cancel}
          variant="secondary"
        >
          Cancelar alterações
        </Button>
        <Button
          type="button"
          loading={busy}
          onClick={save}
          aura
        >
          Salvar e recalcular
        </Button>
      </div>
    </div>
  );
}
