"use client";

/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages */
// Cadastros → Colaboradores (fonte oficial para Alimentação, Café, Cesta e Vale Transporte). Fase 7I: apresentação no
// Design System (PageHeader, FilterBar/SearchInput, DataTable com seleção e ações em lote, Dialog, ImportFlow). Estado,
// endpoints, payloads, CPF (@/lib/cpf), admissão date-only e as confirmações destrutivas continuam AQUI, sem mudança
// de regra; os componentes em modules/collaborators/ui só exibem.
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, Download, FileUp, Plus, SearchCheck, X } from "lucide-react";
import { Button, ConfirmModal, DataTable, Dialog, FeedbackAlert, FilterBar, FloatingActionMenu, PageHeader, SearchInput, buttonClassName, textInputClassName, useToast, type DataTableColumn, type ImportFlowStep } from "@/components/ui";
import { CollaboratorCombobox } from "@/components/CollaboratorCombobox";
import { formatCpf, isValidCpf, maskCpfInput, normalizeCpf } from "@/lib/cpf";
import { dateOnlyFromDb } from "@/lib/date-only";
import { CollaboratorFormFields } from "@/modules/collaborators/ui/CollaboratorFormFields";
import { CollaboratorImport } from "@/modules/collaborators/ui/CollaboratorImport";
import { CollaboratorTable } from "@/modules/collaborators/ui/CollaboratorTable";
import type { CollaboratorItem as Item, ImportOverride, ImportPreview as Preview, ImportResult, ImportStatus } from "@/modules/collaborators/ui/types";

type Pair = { left: Item; right: Item };
type Counts = { food: number; transit: number; aliases: number };
type DeletePlan = {
  scope: "selection" | "all"; ids?: string[]; mode: "purge" | "common"; total: number; deletable?: number; withHistory?: number;
  foodOccurrences?: number; transitAllocations?: number; aliases?: number; mergedLinks?: number; foodBatches?: number; transitMaps?: number; advancedFinancialRecords?: number;
  items: Array<{ id: string; officialName: string; action?: "DELETE" | "DEACTIVATE"; references?: Counts; food?: number; transit?: number; aliases?: number }>;
};

const blank = { officialName: "", jobTitle: "", department: "", costCenter: "", cpf: "", admissionDate: "", active: true };
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
const menuItem = "block w-full cursor-pointer rounded-control px-3 py-2 text-left text-body hover:bg-surface-muted";

export default function CollaboratorsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]), [q, setQ] = useState(""), [department, setDepartment] = useState(""), [costCenter, setCostCenter] = useState(""), [status, setStatus] = useState("all"), [form, setForm] = useState(blank), [editing, setEditing] = useState<string | null>(null), [editOpen, setEditOpen] = useState(false), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string[]>([]), [menuId, setMenuId] = useState<string | null>(null), [confirmAction, setConfirmAction] = useState<{ item: Item; kind: "activate" | "deactivate" } | null>(null), [importOpen, setImportOpen] = useState(false), [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<Preview | null>(null), [overrides, setOverrides] = useState<Record<number, ImportOverride>>({}), [importResult, setImportResult] = useState<ImportResult | null>(null), [importFilter, setImportFilter] = useState<ImportStatus | "">(""), [cpfError, setCpfError] = useState(""), [pairs, setPairs] = useState<Pair[] | null>(null), [mergeCurrent, setMergeCurrent] = useState<Item | null>(null), [mergeOther, setMergeOther] = useState<Item | null>(null), [primaryId, setPrimaryId] = useState(""), [counts, setCounts] = useState<Counts | null>(null);
  const [deletePlan, setDeletePlan] = useState<DeletePlan | null>(null), [deleteConfirmation, setDeleteConfirmation] = useState(""), [isAdmin, setIsAdmin] = useState(false), [adminActions, setAdminActions] = useState(false);
  // Só exibição: qual etapa do ImportFlow está em andamento (análise inicial ou confirmação).
  const [importPhase, setImportPhase] = useState<"idle" | "analyzing" | "applying">("idle");

  const load = useCallback(async () => { const r = await fetch("/api/collaborators?status=all&limit=10000&fields=cpf,admissionDate"); const b = await r.json(); if (!r.ok) throw new Error(b.error); setItems(b.items); }, []);
  useEffect(() => { void load().catch((e) => toast.error(e.message, "Falha ao carregar colaboradores")); }, [load, toast]);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((body) => setIsAdmin((body.roles ?? []).includes("ADMIN"))).catch(() => setIsAdmin(false)); }, []);

  const filtered = useMemo(() => items.filter((i) => (!q || norm(`${i.officialName} ${i.jobTitle} ${i.department} ${i.costCenter}`).includes(norm(q)) || (normalizeCpf(q).length >= 3 && Boolean(i.cpf?.includes(normalizeCpf(q))))) && (!department || i.department === department) && (!costCenter || i.costCenter === costCenter) && (status === "all" || i.active === (status === "active"))), [items, q, department, costCenter, status]);

  const request = async (url: string, init?: RequestInit) => { setBusy(true); try { const r = await fetch(url, init); const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; } catch (e) { toast.error(e instanceof Error ? e.message : "Operação não concluída.", "Não foi possível concluir"); throw e; } finally { setBusy(false); } };

  const openEdit = (item?: Item) => { setMenuId(null); setEditing(item?.id ?? null); setCpfError(""); setForm(item ? { officialName: item.officialName, jobTitle: item.jobTitle, department: item.department, costCenter: item.costCenter, cpf: item.cpf ? formatCpf(item.cpf) : "", admissionDate: dateOnlyFromDb(item.admissionDate) ?? "", active: item.active } : blank); setEditOpen(true); };

  // CPF: máscara na digitação; validação real (dígitos verificadores) antes de enviar — o backend normaliza e valida de novo.
  async function save(e: FormEvent) { e.preventDefault(); if (form.cpf.trim() && !isValidCpf(form.cpf)) { setCpfError("CPF inválido."); return; } setCpfError(""); try { await request(editing ? `/api/collaborators/${editing}` : "/api/collaborators", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cpf: normalizeCpf(form.cpf) || null, admissionDate: form.admissionDate || null }) }); toast.success(editing ? "Colaborador atualizado com sucesso." : "Colaborador cadastrado com sucesso."); setEditOpen(false); await load(); } catch {} }
  const openMerge = (item: Item, other?: Item) => { setMenuId(null); setMergeCurrent(item); setMergeOther(other ?? null); setPrimaryId(item.id); setCounts(null); };
  useEffect(() => { if (!mergeOther) return; fetch(`/api/collaborators/${mergeOther.id}/references`).then((r) => r.json()).then(setCounts).catch(() => setCounts(null)); }, [mergeOther]);
  async function merge() { if (!mergeCurrent || !mergeOther || !primaryId) return; const primary = primaryId === mergeCurrent.id ? mergeCurrent : mergeOther, secondary = primary.id === mergeCurrent.id ? mergeOther : mergeCurrent; try { await request("/api/collaborators/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primaryId: primary.id, secondaryId: secondary.id }) }); toast.success("Colaboradores mesclados com sucesso."); setMergeCurrent(null); setMergeOther(null); await load(); if (pairs) await inspect(); } catch {} }
  async function executeConfirmation() { if (!confirmAction) return; const { item, kind } = confirmAction; try { await request("/api/collaborators/bulk", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [item.id], active: kind === "activate" }) }); toast.success(kind === "activate" ? "Colaborador reativado." : "Colaborador inativado."); setConfirmAction(null); await load(); } catch {} }
  async function bulk(active: boolean) { try { await request("/api/collaborators/bulk", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, active }) }); toast.success(`${selected.length} colaborador(es) ${active ? "reativado(s)" : "inativado(s)"}.`); setSelected([]); await load(); } catch {} }
  async function openDeletion(ids?: string[], scope: "selection" | "all" = "selection") { setMenuId(null); setDeleteConfirmation(""); const mode = isAdmin ? "purge" : "common"; try { const analysis = await request("/api/collaborators/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze", scope, ids, mode: mode === "purge" ? "purge" : undefined }) }); setDeletePlan({ ...analysis, scope, ids, mode }); } catch {} }
  async function confirmDeletion() { if (!deletePlan) return; try { const result = await request("/api/collaborators/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "execute", scope: deletePlan.scope, ids: deletePlan.ids, mode: deletePlan.mode === "purge" ? "purge" : undefined, confirmation: deleteConfirmation }) }); toast.success(deletePlan.mode === "purge" ? "Base de colaboradores limpa com sucesso." : `${result.deleted} colaborador(es) excluído(s). ${result.deactivated} inativado(s) por possuírem histórico.`); const processed = new Set(deletePlan.items.map((item) => item.id)); setSelected((current) => current.filter((id) => !processed.has(id))); setDeletePlan(null); setDeleteConfirmation(""); await load(); } catch {} }
  async function inspect() { try { const b = await request("/api/collaborators/duplicates"); setPairs(b.items); } catch {} }
  // Importação: prévia (nada gravado) → decisões só para linhas em revisão → confirmação reenviando o
  // MESMO arquivo; o servidor revalida tudo e grava em uma transação (qualquer erro bloqueia tudo).
  const importForm = (mode: "preview" | "confirm", next: Record<number, ImportOverride>) => { const data = new FormData(); data.set("file", file!); data.set("mode", mode); data.set("overrides", JSON.stringify(next)); return data; };
  async function analyze(next: Record<number, ImportOverride> = overrides) { if (!file) return; if (!preview) setImportPhase("analyzing"); try { const b: Preview = await request("/api/collaborators/import", { method: "POST", body: importForm("preview", next) }); setPreview(b); setImportResult(null); } catch {} finally { setImportPhase("idle"); } }
  function decide(sourceRow: number, action: ImportOverride) { const next = { ...overrides, [sourceRow]: action }; setOverrides(next); void analyze(next); }
  async function importAll() { if (!preview || preview.blocked) return; setImportPhase("applying"); try { const b: ImportResult = await request("/api/collaborators/import", { method: "POST", body: importForm("confirm", overrides) }); setImportResult(b); setPreview(null); toast.success(`${b.created} criado(s), ${b.updated} atualizado(s), ${b.unchanged} sem alteração, ${b.skipped} ignorado(s).`, "Importação concluída"); await load(); } catch {} finally { setImportPhase("idle"); } }
  const closeImport = () => { setImportOpen(false); setPreview(null); setImportResult(null); setOverrides({}); setImportFilter(""); setFile(null); };
  // "Cancelar" na prévia volta à seleção mantendo o arquivo (como o antigo "Trocar arquivo"); depois do resultado, recomeça.
  const resetImport = () => { setPreview(null); setOverrides({}); setImportFilter(""); if (importResult) { setImportResult(null); setFile(null); } };
  const importStep: ImportFlowStep = importResult ? "done" : importPhase === "applying" ? "applying" : preview ? "preview" : importPhase === "analyzing" ? "processing" : "select";

  const deps = [...new Set(items.map((i) => i.department))].sort(), costs = [...new Set(items.map((i) => i.costCenter).filter(Boolean))].sort();
  const mergeOptions = items.filter((i) => !i.mergedIntoId && i.id !== mergeCurrent?.id);
  // Indicadores só de leitura sobre a base já carregada (nenhum endpoint novo): ajudam a achar cadastros incompletos.
  const live = items.filter((i) => !i.mergedIntoId);
  const kpis = [["Ativos", live.filter((i) => i.active).length], ["Inativos", live.filter((i) => !i.active).length], ["Sem CPF", live.filter((i) => i.active && !i.cpf).length], ["Sem admissão", live.filter((i) => i.active && !i.admissionDate).length], ["Sem centro de custo", live.filter((i) => i.active && !i.costCenter).length]] as const;
  const activeFilters = [q, department, costCenter, status !== "all" ? status : ""].filter(Boolean).length;
  type ComparisonRow = { label: string; a: string; b: string };
  const comparisonColumns: DataTableColumn<ComparisonRow>[] = [
    { id: "label", header: "Campo", rowHeader: true, cell: (row) => row.label },
    { id: "a", header: "Cadastro A", cell: (row) => row.a },
    { id: "b", header: "Cadastro B", cell: (row) => row.b },
  ];

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6">
    <PageHeader backHref="/cadastros" backLabel="Cadastros" eyebrow="Cadastros" title="Colaboradores" description="Fonte oficial para Alimentação e Vale Transporte." actions={<>
      <Button variant="secondary" onClick={() => setImportOpen(true)}><FileUp size={16} aria-hidden="true" />Importar XLSX</Button>
      <a href="/api/collaborators/template" className={buttonClassName({ variant: "secondary" })}><Download size={16} aria-hidden="true" />Baixar máscara</a>
      <Button variant="secondary" onClick={inspect}><SearchCheck size={16} aria-hidden="true" />Ver duplicidades</Button>
      <Button aura onClick={() => openEdit()}><Plus size={16} aria-hidden="true" />Novo colaborador</Button>
    </>} />

    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border sm:grid-cols-5" aria-label="Indicadores do cadastro">
      {kpis.map(([label, value]) => (
        <div key={label} className="bg-surface px-3 py-2.5 last:col-span-2 sm:last:col-span-1"><dt className="text-label text-foreground-muted">{label}</dt><dd className="mt-0.5 text-card-title tabular-nums text-foreground">{value}</dd></div>
      ))}
    </dl>

    {importOpen && (
      <section className="rounded-card border border-border bg-surface p-4 shadow-elevation-sm sm:p-5" aria-label="Importação de colaboradores">
        <div className="mb-2 flex justify-end"><Button variant="ghost" size="sm" disabled={busy} onClick={closeImport}><X size={14} aria-hidden="true" />Fechar importação</Button></div>
        <CollaboratorImport
          step={importStep}
          file={file}
          preview={preview}
          result={importResult}
          filter={importFilter}
          overrides={overrides}
          busy={busy}
          onSelect={(f) => { setFile(f); setOverrides({}); }}
          onClear={() => { setFile(null); setOverrides({}); }}
          onProcess={() => analyze({})}
          onFilter={setImportFilter}
          onDecide={decide}
          onApply={importAll}
          onReset={resetImport}
        />
      </section>
    )}

    {pairs && (
      <section className="grid gap-3 rounded-card border border-border bg-surface p-4 shadow-elevation-sm sm:p-5" aria-label="Possíveis duplicidades">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="text-section-title text-foreground">Possíveis duplicidades</h2><p className="text-body text-foreground-muted">{pairs.length} par(es), sem mesclagem automática.</p></div>
          <Button variant="ghost" onClick={() => setPairs(null)}><X size={14} aria-hidden="true" />Fechar</Button>
        </div>
        {pairs.map((pair) => (
          <div key={`${pair.left.id}-${pair.right.id}`} className="grid items-center gap-3 rounded-control border border-border p-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            <strong>{pair.left.officialName}</strong>
            <ArrowLeftRight size={16} aria-label="comparar com" className="text-foreground-muted" />
            <strong>{pair.right.officialName}</strong>
            <Button size="sm" variant="secondary" onClick={() => openMerge(pair.left, pair.right)}>Comparar/Mesclar</Button>
          </div>
        ))}
      </section>
    )}

    <FilterBar
      label="Filtros de colaboradores"
      search={<SearchInput label="Buscar colaborador" placeholder="Buscar por nome, função, setor, centro de custo ou CPF" value={q} onValueChange={setQ} />}
      activeCount={activeFilters}
      onClear={() => { setQ(""); setDepartment(""); setCostCenter(""); setStatus("all"); }}
      actions={isAdmin && (
        <div className="relative">
          <Button variant="ghost" aria-expanded={adminActions} onClick={() => setAdminActions((value) => !value)}>Ações administrativas<ChevronDown size={14} aria-hidden="true" /></Button>
          {adminActions && (
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-control border border-border bg-surface p-3 shadow-elevation-lg">
              <p className="mb-3 text-caption text-foreground-muted">Remove colaboradores e vínculos operacionais. Usuários e logins são preservados.</p>
              <Button className="w-full" variant="error" onClick={() => { setAdminActions(false); void openDeletion(undefined, "all"); }}>Limpar base de colaboradores</Button>
            </div>
          )}
        </div>
      )}
    >
      <select aria-label="Filtrar departamento" className={textInputClassName} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">Todos os departamentos</option>{deps.map((v) => <option key={v}>{v}</option>)}</select>
      <select aria-label="Filtrar centro de custo" className={textInputClassName} value={costCenter} onChange={(e) => setCostCenter(e.target.value)}><option value="">Todos os centros de custo</option>{costs.map((v) => <option key={v}>{v}</option>)}</select>
      <select aria-label="Filtrar situação" className={textInputClassName} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
    </FilterBar>

    <div className="flex flex-wrap items-center justify-between gap-2 text-body">
      <p className="text-foreground-muted tabular-nums" role="status">{filtered.length} de {items.length} colaborador(es)</p>
      <Button variant="ghost" size="sm" onClick={() => setSelected(filtered.filter((i) => !i.mergedIntoId).map((i) => i.id))}>Selecionar todos os resultados ({filtered.length})</Button>
    </div>
    <CollaboratorTable
      rows={filtered}
      selected={selected}
      onSelectedChange={setSelected}
      busy={busy}
      bulkActions={<>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk(false)}>Inativar selecionados</Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk(true)}>Reativar selecionados</Button>
        <Button size="sm" variant="error" loading={busy} onClick={() => openDeletion(selected)}>Excluir selecionados</Button>
      </>}
      renderActions={(i) => (
        <span className="inline-flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEdit(i)} aria-label={`Editar ${i.officialName}`}>Editar</Button>
          <FloatingActionMenu open={menuId === i.id} onOpenChange={(open) => setMenuId(open ? i.id : null)} label={`Mais ações de ${i.officialName}`}>
            {!i.mergedIntoId && <button role="menuitem" className={menuItem} onClick={() => openMerge(i)}>Mesclar</button>}
            {!i.mergedIntoId && <button role="menuitem" className={menuItem} onClick={() => { setMenuId(null); setConfirmAction({ item: i, kind: i.active ? "deactivate" : "activate" }); }}>{i.active ? "Inativar" : "Reativar"}</button>}
            <div className="my-1 border-t border-border" />
            <button role="menuitem" className={`${menuItem} text-danger-text hover:bg-danger-soft`} onClick={() => openDeletion([i.id])}>Excluir</button>
          </FloatingActionMenu>
        </span>
      )}
    />

    <Dialog open={editOpen} onClose={() => !busy && setEditOpen(false)} dismissible={!busy} size="lg" title={editing ? "Editar colaborador" : "Novo colaborador"} description="O servidor normaliza e valida CPF, datas e campos obrigatórios ao salvar." footer={<><Button variant="secondary" disabled={busy} onClick={() => setEditOpen(false)}>Cancelar</Button><Button aura loading={busy} type="submit" form="collaborator-edit-form">{busy ? "Salvando..." : "Salvar alterações"}</Button></>}>
      <CollaboratorFormFields
        formId="collaborator-edit-form"
        form={form}
        cpfError={cpfError}
        onChange={(patch) => setForm({ ...form, ...patch })}
        onCpfChange={(value) => { setForm({ ...form, cpf: maskCpfInput(value) }); setCpfError(""); }}
        onCpfBlur={() => setCpfError(form.cpf.trim() && !isValidCpf(form.cpf) ? "CPF inválido." : "")}
        onSubmit={save}
      />
    </Dialog>

    <Dialog open={Boolean(mergeCurrent)} onClose={() => !busy && setMergeCurrent(null)} dismissible={!busy} size="lg" title="Mesclar colaboradores" footer={<><Button variant="secondary" disabled={busy} onClick={() => setMergeCurrent(null)}>Cancelar</Button><Button aura loading={busy} disabled={!mergeOther || !primaryId} onClick={merge}>{busy ? "Mesclando..." : "Confirmar mesclagem"}</Button></>}>
      <div className="grid gap-5">
        <div><span className="text-label text-foreground-muted">Cadastro atual</span><strong className="block text-body">{mergeCurrent?.officialName}</strong></div>
        <div className="grid gap-1.5"><span className="text-label text-foreground">Cadastro para comparar</span><CollaboratorCombobox includeInactive value={mergeOther?.id ?? ""} options={mergeOptions} onChange={(item) => { setMergeOther(item as Item); setPrimaryId(mergeCurrent?.id ?? ""); }} /></div>
        {mergeCurrent && mergeOther && <>
          <DataTable
            caption="Comparação dos cadastros"
            columns={comparisonColumns}
            rows={[...([["Nome", "officialName"], ["Função", "jobTitle"], ["Departamento", "department"], ["Centro de Custo", "costCenter"]] as const).map(([label, key]) => ({ label, a: String(mergeCurrent[key] || "—"), b: String(mergeOther[key] || "—") })), { label: "Status", a: mergeCurrent.active ? "Ativo" : "Inativo", b: mergeOther.active ? "Ativo" : "Inativo" }]}
            getRowId={(row) => row.label}
            density="dense"
          />
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-label text-foreground">Qual cadastro deverá permanecer?</legend>
            {[mergeCurrent, mergeOther].map((i) => (
              <label key={i.id} className="flex cursor-pointer gap-3 rounded-control border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" name="primary" checked={primaryId === i.id} onChange={() => setPrimaryId(i.id)} />
                <span><strong>{i.officialName}</strong><small className="block text-caption text-foreground-muted">{i.jobTitle || "—"} · {i.department} · {i.costCenter || "—"}</small></span>
              </label>
            ))}
          </fieldset>
          {counts && (
            <FeedbackAlert status="info" title="Impacto do cadastro selecionado para comparação">
              <ul className="list-inside list-disc"><li>{counts.food} ocorrências de Alimentação</li><li>{counts.transit} registros de Vale Transporte</li><li>{counts.aliases} aliases</li></ul>
              <p className="mt-1">Os vínculos do cadastro secundário serão transferidos para o principal.</p>
            </FeedbackAlert>
          )}
          <p className="rounded-control border border-primary/30 bg-primary-soft p-3 text-body"><strong>Cadastro que permanecerá:</strong> {(primaryId === mergeCurrent.id ? mergeCurrent : mergeOther).officialName}<br /><strong>Cadastro que será inativado:</strong> {(primaryId === mergeCurrent.id ? mergeOther : mergeCurrent).officialName}</p>
        </>}
      </div>
    </Dialog>

    <Dialog open={Boolean(deletePlan)} onClose={() => !busy && setDeletePlan(null)} dismissible={!busy} size="lg" title={deletePlan?.scope === "all" ? "Limpar base de colaboradores?" : deletePlan?.total === 1 ? "Excluir definitivamente?" : "Excluir colaboradores definitivamente?"} footer={<><Button variant="secondary" disabled={busy} onClick={() => setDeletePlan(null)}>Cancelar</Button><Button variant="error" loading={busy} disabled={!deletePlan || (deletePlan.mode === "purge" && (deletePlan.scope === "all" || deletePlan.total > 1) && deleteConfirmation !== "EXCLUIR COLABORADORES") || Boolean(deletePlan.advancedFinancialRecords && deletePlan.scope !== "all")} onClick={confirmDeletion}>{busy ? "Excluindo..." : deletePlan?.mode === "purge" ? "Excluir definitivamente" : "Confirmar exclusão"}</Button></>}>
      <div className="grid gap-4">{deletePlan && <>
        <p className="text-body"><strong>{deletePlan.total} colaborador(es) selecionado(s)</strong></p>
        {deletePlan.mode === "purge" ? <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{([["Alimentação", deletePlan.foodOccurrences], ["Vale Transporte", deletePlan.transitAllocations], ["Aliases", deletePlan.aliases], ["Lotes afetados", deletePlan.foodBatches], ["Mapas afetados", deletePlan.transitMaps], ["Outros vínculos", deletePlan.mergedLinks]] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse rounded-control border border-border bg-surface-muted p-3"><dt className="text-caption text-foreground-muted">{label}</dt><dd className="text-card-title tabular-nums">{value ?? 0}</dd></div>
          ))}</dl>
          {deletePlan.total === 1 && deletePlan.items[0] && <div className="rounded-control border border-border p-4 text-body"><strong>{deletePlan.items[0].officialName}</strong><ul className="mt-2 list-inside list-disc"><li>Alimentação: {deletePlan.items[0].food ?? 0} registros</li><li>Vale Transporte: {deletePlan.items[0].transit ?? 0} registros</li><li>Aliases: {deletePlan.items[0].aliases ?? 0}</li></ul></div>}
          {Boolean(deletePlan.advancedFinancialRecords) && <FeedbackAlert status="warning">{deletePlan.advancedFinancialRecords} obrigação(ões) financeiras serão canceladas e zeradas dentro da mesma transação.</FeedbackAlert>}
          <p className="text-body font-semibold text-danger-text">Os históricos relacionados serão removidos. Esta ação não poderá ser desfeita.</p>
        </> : <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col-reverse rounded-control border border-success/30 bg-success-soft p-3"><dt className="text-caption">podem ser excluídos</dt><dd className="text-card-title tabular-nums text-success-text">{deletePlan.deletable}</dd></div>
          <div className="flex flex-col-reverse rounded-control border border-warning/30 bg-warning-soft p-3"><dt className="text-caption">serão inativados</dt><dd className="text-card-title tabular-nums text-warning-text">{deletePlan.withHistory}</dd></div>
        </dl>}
        <FeedbackAlert status="info">Contas de login, senhas, sessões, usuários, roles e permissões não serão afetados.</FeedbackAlert>
        {deletePlan.mode === "purge" && (deletePlan.scope === "all" || deletePlan.total > 1) && (
          <label className="grid gap-1.5"><span className="text-label text-foreground">Digite <strong>EXCLUIR COLABORADORES</strong> para confirmar</span><input autoFocus className={textInputClassName} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>
        )}
      </>}</div>
    </Dialog>

    <ConfirmModal open={Boolean(confirmAction)} title={confirmAction?.kind === "activate" ? "Reativar colaborador?" : "Inativar colaborador?"} description={confirmAction?.kind === "activate" ? `${confirmAction.item.officialName} voltará a aparecer nos novos lançamentos de Alimentação e Vale Transporte.` : `O histórico de ${confirmAction?.item.officialName} será preservado e ele deixará de aparecer em novos lançamentos.`} confirmLabel={busy ? "Processando..." : confirmAction?.kind === "activate" ? "Reativar" : "Inativar"} destructive={confirmAction?.kind === "deactivate"} busy={busy} onClose={() => setConfirmAction(null)} onConfirm={executeConfirmation} />
  </main>;
}
