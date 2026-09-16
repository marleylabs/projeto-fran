"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfirmModal, DeletionModal, FloatingActionMenu, useToast } from "@/components/ui";
import { CollaboratorCombobox } from "@/components/CollaboratorCombobox";
import { comparePtBr, sortedPtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
type Employee = { id: string; officialName: string; department: string };
type Occurrence = {
  id: string;
  receivedName: string;
  normalizedReceivedName: string;
  receivedDepartment: string;
  employeeId: string | null;
  officialName: string | null;
  confirmedDepartment: string | null;
  duplicateCandidate: boolean;
  matchMethod?: string;
};
type ReviewBatch = {
  id: string;
  originalName: string;
  totalRows: number;
  administrativeEntity: { tradeName: string };
  mealOccurrences: Occurrence[];
  issues?: { id: string; sourceRow: number | null; message: string }[];
};
export function FoodMaReview({
  batch,
  employees,
  reload,
  resetImport,
}: {
  batch: ReviewBatch;
  employees: Employee[];
  reload: () => Promise<void>;
  resetImport: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const row of batch.mealOccurrences)
      map.set(row.normalizedReceivedName, [
        ...(map.get(row.normalizedReceivedName) ?? []),
        row,
      ]);
    return [...map.entries()].sort(([, a], [, b]) => {
      const firstA = a[0];
      const firstB = b[0];
      return (
        comparePtBr(firstA.receivedName, firstB.receivedName) ||
        comparePtBr(
          firstA.confirmedDepartment ?? firstA.receivedDepartment,
          firstB.confirmedDepartment ?? firstB.receivedDepartment,
        ) ||
        comparePtBr(firstA.id, firstB.id)
      );
    });
  }, [batch]);
  const [values, setValues] = useState<
    Record<
      string,
      {
        employeeId: string;
        officialName: string;
        department: string;
        saveAlias: boolean;
        duplicateAction: "KEEP_ALL" | "KEEP_FIRST";
      }
    >
  >(() =>
    Object.fromEntries(
      groups.map(([key, rows]) => [
        key,
        {
          employeeId: rows[0].employeeId ?? "",
          officialName: rows[0].officialName ?? rows[0].receivedName.trim(),
          department: normalizeOrganizationalValue(
            rows[0].confirmedDepartment ?? rows[0].receivedDepartment,
          ),
          saveAlias: false,
          duplicateAction: "KEEP_ALL",
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "IDENTIFIED">("ALL");
  const [search, setSearch] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toast = useToast();
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(reviewOpen&&!dialog.open)dialog.showModal();if(!reviewOpen&&dialog.open)dialog.close()},[reviewOpen]);
  async function cancelImport() {
    setCancelling(true);
    try {
      const response = await fetch(`/api/accounts-payable/food/${batch.id}/discard`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      resetImport();
      setReviewOpen(false);
      setCancelOpen(false);
      await reload();
      toast.info("Nenhum dado da revisão foi confirmado.", "Importação cancelada");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível cancelar a importação.", "A revisão permanece disponível");
    } finally { setCancelling(false); }
  }
  const orderedEmployees = useMemo(
    () =>
      sortedPtBr(
        employees,
        (employee) => employee.officialName,
        (a, b) =>
          comparePtBr(a.department, b.department) || comparePtBr(a.id, b.id),
      ),
    [employees],
  );
  const update = (key: string, patch: Partial<(typeof values)[string]>) =>
    setValues((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  const activeGroups = groups.filter(([key]) => !excluded.includes(key));
  const activeOccurrenceCount = activeGroups.reduce((sum, [, rows]) => sum + rows.length, 0);
  const pendingCount = activeGroups.filter(([key]) => !values[key].employeeId).length;
  const identifiedCount = activeGroups.length - pendingCount;
  const visibleGroups = activeGroups.filter(([key, rows]) => {
    if (filter === "PENDING" && values[key].employeeId) return false;
    if (filter === "IDENTIFIED" && !values[key].employeeId) return false;
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || `${rows.map((row) => row.receivedName).join(" ")} ${values[key].officialName} ${values[key].department}`.toLocaleLowerCase("pt-BR").includes(term);
  });
  const targetGroup = removeTarget ? groups.find(([key]) => key === removeTarget) : undefined;
  async function removeGroup() {
    if (!removeTarget || !targetGroup) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/accounts-payable/food/${batch.id}/review-group`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ normalizedReceivedName: removeTarget }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const name = [...new Set(targetGroup[1].map((row) => row.receivedName))].join(" / ");
      setExcluded((current) => [...current, removeTarget]);
      setRemoveTarget(null);
      toast.warning(`${name} removido da importação. ${body.removedCount} ocorrência(s) foram descartadas.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível remover este registro da importação.");
    } finally { setRemoving(false); }
  }
  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/accounts-payable/food/${batch.id}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolutions: activeGroups.map(([key]) => ({
              normalizedReceivedName: key,
              ...values[key],
            })),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao finalizar lote.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
    <article className="rounded-lg border border-border bg-white p-3 shadow-sm sm:p-4">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-primary">Revisão de colaboradores</p>
      <div className="mt-1.5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h3 className="font-bold text-neutral">{batch.administrativeEntity.tradeName}</h3><p className="text-xs text-secondary">{batch.originalName}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-secondary"><span>{activeOccurrenceCount} registros · {activeGroups.length} grupos</span><span className="badge border-0 bg-emerald-100 text-emerald-800">✓ {identifiedCount} identificados</span><span className="badge border-0 bg-amber-100 text-amber-800">⚠ {pendingCount} pendentes</span></div><p className="mt-1.5 text-xs text-secondary">{pendingCount?"Revisão necessária antes da geração da obrigação.":"Revisão concluída. Confira os dados antes de gerar a obrigação."}</p></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="secondary" onClick={()=>setCancelOpen(true)}>Cancelar importação</Button><Button type="button" aura onClick={()=>setReviewOpen(true)}>{pendingCount?"Revisar colaboradores":"Conferir revisão"}</Button></div>
      </div>
    </article>
    <dialog ref={dialogRef} className="modal food-review-dialog" onCancel={(event)=>{if(busy||removing||cancelling)event.preventDefault();else setReviewOpen(false)}} onClose={()=>setReviewOpen(false)} aria-labelledby={`food-review-title-${batch.id}`} aria-describedby={`food-review-description-${batch.id}`}>
    <article className="food-review-workspace border border-border bg-base-200">
      <header className="food-review-header flex flex-wrap justify-between gap-3 bg-white">
        <div>
          <h3 id={`food-review-title-${batch.id}`} className="font-bold">
            Revisar colaboradores · {batch.administrativeEntity.tradeName}
          </h3>
          <p id={`food-review-description-${batch.id}`} className="text-sm text-text-muted">
            {activeOccurrenceCount} registros · {activeGroups.length} grupos de nomes ·
            obrigação ainda não gerada
          </p>
        </div>
        <div className="flex items-start gap-2"><div className="flex flex-wrap gap-1.5 text-xs font-semibold"><span className="badge border-0 bg-emerald-100 text-emerald-800">{identifiedCount} identificados</span><span className="badge border-0 bg-amber-100 text-amber-800">{pendingCount} pendentes</span></div><button type="button" className="grid h-8 w-8 place-items-center rounded-md text-lg text-secondary hover:bg-base-200" aria-label="Fechar revisão" onClick={()=>setReviewOpen(false)}>×</button></div>
      </header>
      <div className="food-review-filters flex flex-col gap-2 border-b border-border bg-white sm:flex-row sm:items-center">
        <div className="flex flex-wrap rounded-md border border-border bg-white p-0.5"><button type="button" onClick={()=>setFilter("ALL")} className={`h-8 rounded px-2.5 text-xs ${filter==="ALL"?"bg-primary text-white":""}`}>Todos ({activeGroups.length})</button><button type="button" onClick={()=>setFilter("PENDING")} className={`h-8 rounded px-2.5 text-xs ${filter==="PENDING"?"bg-primary text-white":""}`}>Pendentes ({pendingCount})</button><button type="button" onClick={()=>setFilter("IDENTIFIED")} className={`h-8 rounded px-2.5 text-xs ${filter==="IDENTIFIED"?"bg-primary text-white":""}`}>Identificados ({identifiedCount})</button></div>
        <input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar nome ou setor" className="input min-w-0 flex-1 border border-border bg-white" />
      </div>
      <div className="food-review-body grid overflow-y-auto">
        {batch.issues?.map((issue) => <p key={issue.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{issue.sourceRow ? `Linha ${issue.sourceRow}: ` : ""}{issue.message}</p>)}
        {visibleGroups.map(([key, rows]) => {
          const value = values[key];
          const variants = [...new Set(rows.map((row) => row.receivedName))].sort(comparePtBr);
          const sectors = [
            ...new Set(rows.map((row) => row.receivedDepartment)),
          ].sort(comparePtBr);
          const duplicate = rows.some((row) => row.duplicateCandidate);
          return (
            <div
              key={key}
              className="rounded-md border border-border bg-white p-2.5"
            >
              <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
                <div className="flex min-w-0 items-start gap-2 border-b border-border pb-2 md:col-span-2">
                  <div className="min-w-0 flex-1">
                  <strong className="block break-words text-[13px]">{variants.join(" / ")}</strong>
                  <p className="text-[11px] text-text-muted">{rows.length} refeição(ões) · {sectors.join(" / ")}</p>
                  </div>
                  <FloatingActionMenu open={openMenu===key} onOpenChange={(open)=>setOpenMenu(open?key:null)} label={`Ações de ${variants[0]}`}><button type="button" role="menuitem" className="w-full rounded-md px-3 py-2 text-left text-sm text-error hover:bg-error/10" onClick={()=>setRemoveTarget(key)}>Remover da importação</button></FloatingActionMenu>
                </div>
                <div className="min-w-0 text-xs md:col-span-2">
                  <span className="mb-1 block">Colaborador oficial</span>
                  <CollaboratorCombobox value={value.employeeId} options={orderedEmployees.map(employee=>({...employee,jobTitle:"",costCenter:"",active:true}))} onChange={employee=>update(key,{employeeId:employee.id,officialName:employee.officialName})}/>
                </div>
                <label className="text-xs">
                  Nome confirmado
                  <input
                    value={value.officialName}
                    readOnly={Boolean(value.employeeId)}
                    onChange={(event) =>
                      update(key, {
                        officialName: event.target.value,
                        employeeId: "",
                      })
                    }
                    className="input mt-1 w-full border border-border bg-white read-only:bg-slate-50"
                  />
                </label>
                <label className="text-xs">
                  Setor confirmado
                  <input
                    value={value.department}
                    onChange={(event) =>
                      update(key, { department: normalizeOrganizationalValue(event.target.value) })
                    }
                    className="input mt-1 w-full border border-border"
                  />
                </label>
                <div className="text-sm md:col-span-2">
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={value.saveAlias}
                      onChange={(event) =>
                        update(key, { saveAlias: event.target.checked })
                      }
                    />
                    Salvar “{variants[0]}” como alias deste colaborador
                  </label>
                  {duplicate && (
                    <label className="mt-2 block text-xs">
                      Possível duplicidade
                      <select
                        value={value.duplicateAction}
                        onChange={(event) =>
                          update(key, {
                            duplicateAction: event.target.value as
                              | "KEEP_ALL"
                              | "KEEP_FIRST",
                          })
                        }
                        className="mt-1 w-full rounded-md border border-amber-300 px-2 py-1"
                      >
                        <option value="KEEP_ALL">Manter todas</option>
                        <option value="KEEP_FIRST">Uma por dia</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!visibleGroups.length && <p className="rounded-md border border-dashed border-border bg-white p-6 text-center text-sm text-text-muted">Nenhum colaborador encontrado neste filtro.</p>}
      </div>
      <footer className="food-review-footer flex flex-col gap-3 border-t border-border bg-white sm:flex-row sm:items-center sm:justify-between"><Button type="button" variant="secondary" disabled={busy||removing} onClick={()=>setCancelOpen(true)}>Cancelar importação</Button><div className="flex flex-col gap-2 text-right sm:items-end"><span className={`text-xs ${pendingCount?"text-amber-700":"text-emerald-700"}`}>{pendingCount?`${pendingCount} pendência(s) precisam ser resolvidas`:"0 pendências · revisão pronta para confirmar"}</span><Button type="button" onClick={finalize} loading={busy} disabled={pendingCount>0} aura>Confirmar revisão e gerar rateio</Button></div></footer>
      {error && <p className="absolute bottom-24 left-4 right-4 z-10 rounded-md bg-red-50 p-3 text-sm text-red-700 shadow">{error}</p>}
    </article>
    <form method="dialog" className="modal-backdrop"><button aria-label="Fechar revisão" disabled={busy||removing||cancelling}>Fechar</button></form>
    </dialog>
      <DeletionModal open={Boolean(removeTarget)} title="Remover este colaborador da importação?" description={targetGroup ? <><strong>{[...new Set(targetGroup[1].map((row)=>row.receivedName))].join(" / ")}</strong><br/>{targetGroup[1].length} ocorrência(s)<br/>Setor: {[...new Set(targetGroup[1].map((row)=>row.receivedDepartment))].join(" / ")}<br/><br/>As ocorrências deste nome serão removidas somente do processamento atual.<br/><strong>O Cadastro Mestre de Colaboradores não será alterado.</strong></> : null} count={targetGroup?.[1].length} actionLabel={`Remover ${targetGroup?.[1].length??0} ocorrência(s)`} busy={removing} onClose={()=>setRemoveTarget(null)} onConfirm={removeGroup}/>
      <ConfirmModal open={cancelOpen} title="Cancelar esta importação?" description={`${batch.administrativeEntity.tradeName} · ${batch.originalName} · ${activeOccurrenceCount} registros · ${activeGroups.length} grupos de nomes. Todas as associações, correções e alterações ainda não confirmadas serão descartadas. Nenhuma obrigação definitiva será gerada.`} cancelLabel="Continuar revisão" confirmLabel="Cancelar importação" destructive busy={cancelling} onClose={()=>{if(!cancelling)setCancelOpen(false)}} onConfirm={cancelImport}/>
    </>
  );
}
