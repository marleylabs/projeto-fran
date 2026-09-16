"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization -- competence changes load a persisted server snapshot */
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CorporateHeader } from "@/components/CorporateHeader";
import { Button, DeletionModal, EmptyState, FileInput, PageHeader, buttonClassName, useToast, type FileInputStatus } from "@/components/ui";
import { type CollaboratorOption } from "@/components/CollaboratorCombobox";
import { CollaboratorMultiCombobox } from "@/components/CollaboratorMultiCombobox";
import { ManualEntrySection } from "@/components/ManualEntryLayout";
import { formatCnpj } from "@/modules/administrative-entities/schema";
import { comparePtBr, sortedPtBr } from "@/lib/sorting/ptBr";
type Entity = {
    id: string;
    cnpj: string | null;
    tradeName: string;
    legalName: string;
    locality: string;
};
type Allocation = {
    id: string;
    employeeId: string | null;
    company: string;
    sourceIdentifier: string | null;
    employeeName: string;
    originalEmployeeName: string | null;
    department: string | null;
    serviceDate: string | null;
    service: string | null;
    costCenter: string | null;
    dailyAmount: string | null;
    previousMonthDifference: string | null;
    occasionalDiscounts: string | null;
    days: string | null;
    amount: string;
};
type Issue = {
    id: string;
    sourceRow: number | null;
    message: string;
    rawData: Record<string, string | number | null> | null;
    fieldErrors: Array<{ field: string; label: string; reason: string; message: string }> | null;
    suggestedData: Record<string, string | null> | null;
    resolvedAt: string | null;
};
type MapData = {
    id: string;
    version: number;
    status: "READY" | "WITH_INCONSISTENCIES";
    originalName: string;
    validRows: number;
    totalRows: number;
    invalidRows: number;
    totalAmount: string;
    administrativeEntity: Entity;
    financialRecord: {
        identifier: string;
    } | null;
    allocations: Allocation[];
    issues: Issue[];
};
const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const employeeKey = (row: Allocation) => row.employeeId ?? normalize(`${row.company}|${row.department}|${row.employeeName}`);
const acceptsMA = (value: string) => value.toUpperCase().split(/[\/,;]/).map((part) => part.trim()).includes("MA");
function Icon({ type }: {
    type: "company" | "users" | "departments" | "total";
}) { const paths = { company: <>
<path d="M3 21h18M6 21V7l6-4 6 4v14M9 10h.01M15 10h.01"/>
</>, users: <>
<circle cx="9" cy="7" r="4"/>
<path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 3a4 4 0 0 1 0 8M22 21v-2a5 5 0 0 0-3-4.6"/>
</>, departments: <>
<rect x="3" y="3" width="7" height="7" rx="1"/>
<rect x="14" y="3" width="7" height="7" rx="1"/>
<rect x="8.5" y="14" width="7" height="7" rx="1"/>
<path d="M6.5 10v2h11v-2M12 12v2"/>
</>, total: <>
<circle cx="12" cy="12" r="9"/>
<path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12"/>
</> }; return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">{paths[type]}</svg>; }
function Summary({ maps }: {
    maps: MapData[];
}) { const rows = maps.flatMap((map) => map.allocations); const stats = [{ label: "Empresas", value: new Set(rows.map((row) => normalize(row.company))).size, description: "Empresas no rateio", icon: "company" as const }, { label: "Colaboradores", value: new Set(rows.map(employeeKey)).size, description: "Colaboradores únicos", icon: "users" as const }, { label: "Departamentos", value: new Set(rows.map((row) => normalize(`${row.company}|${row.department}`))).size, description: "Departamentos", icon: "departments" as const }, { label: "Valor total", value: money(rows.reduce((sum, row) => sum + Number(row.amount), 0)), description: "Competência atual", icon: "total" as const }]; return <section aria-label="Resumo do Vale Transporte" className="stats grid w-full grid-cols-1 overflow-hidden border border-base-300 bg-base-100 shadow-sm sm:grid-cols-2 xl:grid-cols-4 [grid-auto-flow:row]">{stats.map((stat, index) => <div className="stat min-w-0 border-b border-base-300 px-4 py-5 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0" key={stat.label}>
<div className="stat-figure text-primary">
<Icon type={stat.icon}/>
</div>
<div className="stat-title text-secondary">{stat.label}</div>
<div className={`stat-value break-words ${index === 3 ? "text-2xl text-primary sm:text-3xl xl:text-2xl 2xl:text-3xl" : "text-3xl text-neutral"}`}>{stat.value}</div>
<div className="stat-desc text-secondary">{stat.description}</div>
</div>)}</section>; }
function EmployeeDetails({ row,selected,onToggle,onDelete }: {
    row: Allocation;selected:boolean;onToggle:()=>void;onDelete:()=>void;
}) { return <details className="rounded-lg border border-base-300 bg-base-100">
<summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 font-semibold">
<span className="flex min-w-0 items-center gap-3"><input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={selected} onClick={event=>event.stopPropagation()} onChange={onToggle} aria-label={`Selecionar ${row.employeeName}`}/><span className="truncate">{row.employeeName}</span></span>
<span className="flex shrink-0 items-center gap-3"><span className="text-primary">{money(row.amount)}</span><button type="button" className="text-xs font-semibold text-error" onClick={event=>{event.preventDefault();event.stopPropagation();onDelete()}}>Excluir</button></span>
</summary>
<dl className="grid gap-3 border-t border-base-300 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Nome recebido", row.originalEmployeeName], ["Empresa", row.company], ["Departamento", row.department], ["Data", row.serviceDate ? new Date(row.serviceDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null], ["Serviço", row.service], ["CC", row.costCenter], ["Valor dia", row.dailyAmount ? money(row.dailyAmount) : null], ["Dif. mês anterior", row.previousMonthDifference ? money(row.previousMonthDifference) : null], ["Descontos eventuais", row.occasionalDiscounts ? money(row.occasionalDiscounts) : null], ["Dias", row.days], ["Valor total", money(row.amount)]].map(([label, value]) => <div key={label}>
<dt className="text-xs text-secondary">{label}</dt>
<dd className="font-medium text-neutral">{value || "—"}</dd>
</div>)}</dl>
</details>; }
const reviewFields = [
    ["company", "EMPRESA", "text"], ["employeeName", "NOME", "text"], ["serviceDate", "DATA", "date"], ["department", "DEPARTAMENTO", "text"], ["service", "SERVIÇO", "text"], ["costCenter", "CC", "text"], ["dailyAmount", "VALOR DIA", "number"], ["previousMonthDifference", "DIF MÊS ANTERIOR", "number"], ["occasionalDiscounts", "DESCONTOS EVENTUAIS", "number"], ["days", "DIAS", "number"], ["amount", "VALOR TOTAL", "number"],
] as const;
function PendingItem({ issue, mapId, onSaved }: { issue: Issue; mapId: string; onSaved: () => Promise<void> }) {
    const initial = Object.fromEntries(reviewFields.map(([field]) => [field, String(issue.rawData?.[field] ?? "")])) as Record<string, string>;
    const [data, setData] = useState(initial); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
    const errorFor = (field: string) => issue.fieldErrors?.find((item) => item.field === field);
    function applySuggestion() { if (!issue.suggestedData) return; setData((current) => ({ ...current, ...Object.fromEntries(Object.entries(issue.suggestedData ?? {}).filter(([key, value]) => key in current && value !== null).map(([key, value]) => [key, String(value)])) })); }
    async function save() { setSaving(true); setError(null); try { const response = await fetch(`/api/accounts-payable/transit-voucher/${mapId}/issues/${issue.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar correção."); } finally { setSaving(false); } }
    return <article className="rounded-xl border border-warning/40 bg-base-100 p-4"><header className="mb-4"><p className="text-xs font-bold uppercase text-warning">Linha {issue.sourceRow ?? "—"}</p><h5 className="font-bold text-neutral">{String(issue.rawData?.employeeName ?? "Colaborador não identificado")}</h5><p className="text-sm text-secondary">{String(issue.rawData?.company ?? "Empresa não informada")}</p></header>{issue.suggestedData && <div className="mb-4 rounded-lg bg-info/10 p-3 text-sm"><strong>Sugestão — {issue.suggestedData.source}</strong><p>{issue.suggestedData.department ? `Departamento: ${issue.suggestedData.department}` : "Dados anteriores encontrados"}</p><Button size="sm" variant="secondary" className="mt-2" onClick={applySuggestion}>Aplicar sugestão</Button></div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{reviewFields.map(([field, label, type]) => { const fieldError = errorFor(field); const received = issue.rawData?.[field]; return <label key={field} className="form-control"><span className={`label-text mb-1 ${fieldError ? "font-semibold text-warning" : ""}`}>{label}{fieldError?.reason === "required" ? " *" : ""}</span><input type={type} step={type === "number" ? "0.01" : undefined} className={`input input-bordered w-full ${fieldError ? "input-warning" : ""}`} value={data[field]} onChange={(event) => setData((current) => ({ ...current, [field]: event.target.value }))} />{fieldError && <span className="mt-1 text-xs text-warning">{fieldError.message}</span>}{received !== null && received !== undefined && String(received) !== data[field] && <span className="mt-1 text-xs text-secondary">Valor recebido: {String(received)}</span>}</label>; })}</div>{error && <div className="alert alert-error mt-3 text-sm">{error}</div>}<Button className="mt-4" onClick={save} loading={saving} aura>Salvar correção</Button></article>;
}
function PendingReview({ map, onSaved }: { map: MapData; onSaved: () => Promise<void> }) { const [query, setQuery] = useState(""); const pending = map.issues.filter((issue) => !issue.resolvedAt).filter((issue) => normalize(`${issue.sourceRow} ${issue.rawData?.employeeName ?? ""} ${issue.rawData?.company ?? ""} ${issue.rawData?.department ?? ""}`).includes(normalize(query))); return <section className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4"><div className="mb-4"><h4 className="font-bold text-neutral">PENDÊNCIAS DO UPLOAD</h4><p className="text-sm text-secondary">{map.invalidRows} registro(s) precisam de revisão</p></div><input className="input input-bordered mb-4 w-full" placeholder="Buscar por colaborador, empresa, departamento ou linha" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="grid gap-4">{pending.map((issue) => <PendingItem key={issue.id} issue={issue} mapId={map.id} onSaved={onSaved} />)}</div></section>; }
function MapCard({ map, onReload }: {
    map: MapData;
    onReload: () => Promise<void>;
}) {
    const [open, setOpen] = useState(true);
    const [reviewing, setReviewing] = useState(false);
    const [query, setQuery] = useState("");
    const [companyFilter, setCompanyFilter] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("");
    const [selected,setSelected]=useState<string[]>([]);const [deleteTarget,setDeleteTarget]=useState<"records"|"map"|null>(null);const [pendingIds,setPendingIds]=useState<string[]>([]);const [deleting,setDeleting]=useState(false);const [deleteError,setDeleteError]=useState<string|null>(null);
    const companies = useMemo(() => [...new Set(map.allocations.map((row) => row.company))].sort(comparePtBr), [map]);
    const departments = useMemo(() => [...new Set(map.allocations.filter((row) => !companyFilter || row.company === companyFilter).map((row) => row.department ?? "Não informado"))].sort(comparePtBr), [map, companyFilter]);
    const filtered = useMemo(() => map.allocations.filter((row) => { const haystack = normalize([row.employeeName, row.company, row.department, row.service, row.costCenter].filter(Boolean).join(" ")); return (!query || haystack.includes(normalize(query))) && (!companyFilter || row.company === companyFilter) && (!departmentFilter || (row.department ?? "Não informado") === departmentFilter); }).sort((a,b)=>comparePtBr(a.company,b.company)||comparePtBr(a.department,b.department)||comparePtBr(a.employeeName,b.employeeName)||comparePtBr(a.id,b.id)), [map, query, companyFilter, departmentFilter]);
    const groups = useMemo(() => { const result = new Map<string, Map<string, Allocation[]>>(); for (const row of filtered) {
        const departments = result.get(row.company) ?? new Map();
        const department = row.department ?? "Não informado";
        departments.set(department, [...(departments.get(department) ?? []), row]);
        result.set(row.company, departments);
    } return result; }, [filtered]);
    const unique = new Set(map.allocations.map(employeeKey)).size;
    const requestDelete=(ids:string[])=>{setPendingIds(ids);setDeleteTarget("records");setDeleteError(null)};async function confirmDelete(reason:string){setDeleting(true);setDeleteError(null);try{const url=deleteTarget==="map"?`/api/accounts-payable/transit-voucher/${map.id}`:`/api/accounts-payable/transit-voucher/${map.id}/records`;const response=await fetch(url,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify(deleteTarget==="map"?{reason,confirmation:"EXCLUIR"}:{ids:pendingIds,reason})});const body=await response.json();if(!response.ok)throw new Error(body.error);setSelected([]);setPendingIds([]);setDeleteTarget(null);await onReload();}catch(cause){setDeleteError(cause instanceof Error?cause.message:"Não foi possível excluir o registro.")}finally{setDeleting(false)}}
    return <article className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
<div className="flex flex-wrap justify-between gap-3">
<div>
<h3 className="font-bold text-neutral">{map.originalName}</h3>
<p className="text-xs text-secondary">v{map.version} · {map.administrativeEntity.tradeName} · {map.validRows} registros · {unique} colaboradores únicos</p>
</div>
<span className={`badge h-auto py-2 font-semibold ${map.status === "READY" ? "badge-success" : "badge-warning"}`}>{map.status === "READY" ? "✓ Processamento validado" : `⚠ ${map.invalidRows} pendência(s) de revisão`}</span>
</div>
<div className="mt-4 flex flex-wrap gap-2">
<Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? "Ocultar rateio" : "Ver rateio"}</Button>
{map.invalidRows > 0 && <Button size="sm" variant="warning" onClick={() => setReviewing(!reviewing)}>{reviewing ? "Fechar pendências" : "Revisar pendências"}</Button>}
<a href={`/api/accounts-payable/transit-voucher/${map.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}>Download do Rateio XLSX</a>
<Button size="sm" variant="error" onClick={()=>setDeleteTarget("map")}>Excluir processamento</Button>
</div>{reviewing && <PendingReview map={map} onSaved={onReload} />}{open && <div className="mt-5">
<div className="grid gap-3 md:grid-cols-3">
<input className="input input-bordered w-full" placeholder="Buscar colaborador, empresa, serviço ou CC" value={query} onChange={(event) => setQuery(event.target.value)}/>
<select className="select select-bordered w-full" value={companyFilter} onChange={(event) => { setCompanyFilter(event.target.value); setDepartmentFilter(""); }}>
<option value="">Todas as empresas</option>{companies.map((company) => <option key={company}>{company}</option>)}</select>
<select className="select select-bordered w-full" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
<option value="">Todos os departamentos</option>{departments.map((department) => <option key={department}>{department}</option>)}</select>
</div>
<div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><button type="button" className="font-semibold text-primary" onClick={()=>setSelected([...new Set([...selected,...filtered.map(row=>row.id)])])}>Selecionar todos os resultados ({filtered.length})</button>{selected.length>0&&<><span>{selected.length} selecionado(s)</span><button type="button" className="text-secondary" onClick={()=>setSelected([])}>Limpar seleção</button><Button size="sm" variant="error" onClick={()=>requestDelete(selected)}>Excluir selecionados</Button></>}</div>
<div className="mt-4 grid gap-3">{[...groups].map(([company, departmentGroups]) => { const rows = [...departmentGroups.values()].flat(); return <details open key={company} className="collapse-arrow collapse border border-base-300 bg-base-200">
<summary className="collapse-title">
<span className="font-bold text-neutral">{company}</span>
<span className="ml-2 text-sm text-secondary">{new Set(rows.map(employeeKey)).size} colaboradores · {money(rows.reduce((sum, row) => sum + Number(row.amount), 0))}</span>
</summary>
<div className="collapse-content grid gap-3">{[...departmentGroups].map(([department, departmentRows]) => <details open key={department} className="collapse-arrow collapse border border-base-300 bg-base-100">
<summary className="collapse-title py-3">
<span className="font-semibold">{department}</span>
<span className="ml-2 text-sm text-secondary">{new Set(departmentRows.map(employeeKey)).size} colaboradores · {money(departmentRows.reduce((sum, row) => sum + Number(row.amount), 0))}</span>
</summary>
<div className="collapse-content grid gap-2">{departmentRows.map((row) => <EmployeeDetails key={row.id} row={row} selected={selected.includes(row.id)} onToggle={()=>setSelected(current=>current.includes(row.id)?current.filter(id=>id!==row.id):[...current,row.id])} onDelete={()=>requestDelete([row.id])}/>)}</div>
</details>)}</div>
</details>; })}{!filtered.length && <p className="py-8 text-center text-sm text-secondary">Nenhum registro encontrado para os filtros.</p>}</div></div>}{deleteError&&<div role="alert" className="alert alert-error mt-4 text-sm">{deleteError}</div>}<DeletionModal open={deleteTarget!==null} title={deleteTarget==="map"?"Excluir todo o processamento?":`Excluir ${pendingIds.length>1?`${pendingIds.length} registros`:"registro"}?`} description={deleteTarget==="map"?<><strong>{map.originalName} · {map.administrativeEntity.tradeName}</strong><br/>{map.validRows} registros · {unique} colaboradores · {money(map.totalAmount)}<br/>O processamento e a obrigação serão cancelados; o arquivo original será preservado.</>:"Essa ação cancelará os registros e recalculará departamento, empresa, total, obrigação e download."} count={deleteTarget==="map"?1:pendingIds.length} requireKeyword={deleteTarget==="map"} busy={deleting} onClose={()=>{if(!deleting){setDeleteTarget(null);setPendingIds([])}}} onConfirm={confirmDelete}/></article>;
}
export default function TransitVoucherPage() {
    const router = useRouter();
    const toast = useToast();
    const now = new Date();
    const [competence, setCompetence] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    const [year, month] = competence.split("-").map(Number);
    const [email, setEmail] = useState<string | null>(null);
    const [entities, setEntities] = useState<Entity[]>([]);
    const [maps, setMaps] = useState<MapData[]>([]);
    const [entityId, setEntityId] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState("");
    const [uploadStatus, setUploadStatus] = useState<FileInputStatus>("normal");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult] = useState<MapData | null>(null);
    const [entryMode,setEntryMode]=useState<"upload"|"manual">("upload"); const [collaborators,setCollaborators]=useState<CollaboratorOption[]>([]); const [manualEmployeeIds,setManualEmployeeIds]=useState<string[]>([]); const [manual,setManual]=useState({company:"",serviceDate:"",service:"",dailyAmount:"",previousMonthDifference:"",occasionalDiscounts:"",days:"",amount:""});
    const [individualValues,setIndividualValues]=useState<Record<string,Partial<typeof manual>>>({}); const [editingIndividuals,setEditingIndividuals]=useState(false); const [manualSuccess,setManualSuccess]=useState<string|null>(null); const manualReady=Boolean(entityId&&manualEmployeeIds.length&&manual.company.trim()&&manual.serviceDate&&Number(manual.amount)>0&&manualEmployeeIds.every(id=>Number(individualValues[id]?.amount??manual.amount)>0)); const manualHint=!entityId?"Selecione o Cadastro da obrigação para continuar.":!manualEmployeeIds.length?"Selecione ao menos um colaborador para continuar.":!manual.company.trim()?"Informe a empresa para continuar.":!manual.serviceDate?"Informe uma data da competência para continuar.":!manualReady?"Informe um Valor total válido para todos os colaboradores.":null; const manualDateMin=`${year}-${String(month).padStart(2,"0")}-01`;const manualDateMax=`${year}-${String(month).padStart(2,"0")}-${String(new Date(year,month,0).getDate()).padStart(2,"0")}`;
    const load = useCallback(async () => { const response = await fetch(`/api/accounts-payable/transit-voucher?year=${year}&month=${month}`); const body = await response.json(); if (!response.ok)
        throw new Error(body.error); setMaps(body.competence?.maps ?? []); }, [year, month]);
    useEffect(() => { load().catch(() => setError("Falha ao carregar rateios.")); }, [load]);
    useEffect(() => { Promise.all([fetch("/api/administrative-entities?q=").then((r) => r.json()), fetch("/api/auth/me").then((r) => r.json()),fetch("/api/collaborators?status=active&limit=1000").then(r=>r.json())]).then(([body, me,people]) => { setEntities((body.items ?? []).filter((entity: Entity) => acceptsMA(entity.locality))); setEmail(me.email ?? null);setCollaborators(people.items??[]); }); }, []);
    async function upload(event: FormEvent) { event.preventDefault(); if (!file)
        return; setBusy(true); setError(null); const form = new FormData(); form.set("year", String(year)); form.set("month", String(month)); form.set("administrativeEntityId", entityId); form.set("file", file); try {
        const response = await fetch("/api/accounts-payable/transit-voucher/upload", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok)
            throw new Error(body.error);
        toast.success(`${body.map.totalRows} registros importados; ${body.map.invalidRows} pendência(s).`,"Arquivo processado com sucesso");
        setFile(null);
        setFileName("");
        setUploadStatus("success");
        await load();
    }
    catch (cause) {
        setUploadStatus("error");
        toast.error(cause instanceof Error ? cause.message : "Falha ao processar Vale Transporte.","Falha no processamento");
    }
    finally {
        setBusy(false);
    } }
    async function saveManual(event:FormEvent){event.preventDefault();if(!manualReady)return;setBusy(true);setError(null);try{const entries=manualEmployeeIds.map(employeeId=>({employeeId,dailyAmount:individualValues[employeeId]?.dailyAmount??manual.dailyAmount,previousMonthDifference:individualValues[employeeId]?.previousMonthDifference??manual.previousMonthDifference,occasionalDiscounts:individualValues[employeeId]?.occasionalDiscounts??manual.occasionalDiscounts,days:individualValues[employeeId]?.days??manual.days,amount:individualValues[employeeId]?.amount??manual.amount}));const response=await fetch("/api/accounts-payable/transit-voucher/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({year,month,administrativeEntityId:entityId,company:manual.company,serviceDate:manual.serviceDate,service:manual.service,entries})});const body=await response.json();if(!response.ok)throw new Error(body.error);setManualEmployeeIds([]);setIndividualValues({});setEditingIndividuals(false);setManual({company:"",serviceDate:"",service:"",dailyAmount:"",previousMonthDifference:"",occasionalDiscounts:"",days:"",amount:""});toast.success(body.duplicateCount?`${body.createdCount} lançamento(s) adicionado(s). ${body.duplicateCount} duplicidade(s) ignorada(s): ${body.duplicateNames.join(", ")}.`:`${body.createdCount} lançamento(s) de Vale Transporte adicionado(s).`);await load()}catch(cause){toast.error(cause instanceof Error?cause.message:"Falha ao salvar lançamentos.","Não foi possível salvar")}finally{setBusy(false)}}
    async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
    return <div className="flex flex-1 flex-col">
<CorporateHeader currentUserEmail={email} onLogout={logout}/>
<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
<PageHeader backHref="/pagamentos" backLabel="Contas a pagar" title="Vale Transporte" description="Rateio por Empresa → Departamento → Colaborador · Maranhão (MA)."/>
<section className="card p-5">
<div className="mb-5 rounded-lg border border-base-300 bg-base-200/60 p-1"><div role="tablist" aria-label="Forma de entrada do Vale Transporte" className="grid grid-cols-2 gap-1"><Button role="tab" aria-selected={entryMode==="upload"} variant={entryMode==="upload"?"primary":"ghost"} onClick={()=>setEntryMode("upload")}>Upload de arquivo</Button><Button role="tab" aria-selected={entryMode==="manual"} variant={entryMode==="manual"?"primary":"ghost"} onClick={()=>setEntryMode("manual")}>Lançamento manual</Button></div></div>
{entryMode==="manual"?<form onSubmit={saveManual} className="grid gap-5" aria-describedby={manualHint?"manual-transit-hint":undefined}><ManualEntrySection eyebrow="1. Contexto" title="Dados da obrigação"><div className="grid gap-4 md:grid-cols-2"><label htmlFor="transit-manual-competence" className="form-control"><span className="label-text mb-1">Competência *</span><input id="transit-manual-competence" type="month" className="input input-bordered w-full" value={competence} onChange={e=>setCompetence(e.target.value)}/></label><label htmlFor="transit-manual-entity" className="form-control"><span className="label-text mb-1">Cadastro da obrigação *</span><select id="transit-manual-entity" required className="select select-bordered w-full" value={entityId} onChange={e=>{setEntityId(e.target.value);setManualSuccess(null)}}><option value="">Selecionar cadastro</option>{entities.map(entity=><option key={entity.id} value={entity.id}>{entity.tradeName}</option>)}</select>{!entityId&&<span className="mt-1 text-xs text-secondary">Selecione o cadastro que receberá a obrigação.</span>}</label></div></ManualEntrySection><ManualEntrySection eyebrow="2. Pessoas" title="Colaboradores"><CollaboratorMultiCombobox value={manualEmployeeIds} options={collaborators} onChange={ids=>{setManualEmployeeIds(ids);setManualSuccess(null)}}/></ManualEntrySection><ManualEntrySection eyebrow="3. Benefício" title="Dados do Vale Transporte"><div className="grid gap-4 md:grid-cols-2"><label htmlFor="transit-manual-company" className="form-control"><span className="label-text mb-1">Empresa *</span><input id="transit-manual-company" required className={`input input-bordered w-full ${manualEmployeeIds.length&&!manual.company.trim()?"input-warning":""}`} value={manual.company} onChange={e=>setManual({...manual,company:e.target.value})}/>{Boolean(manualEmployeeIds.length)&&!manual.company.trim()&&<span className="mt-1 text-xs text-warning">Empresa é obrigatória.</span>}</label><label htmlFor="transit-manual-date" className="form-control"><span className="label-text mb-1">Data *</span><input id="transit-manual-date" required type="date" min={manualDateMin} max={manualDateMax} className="input input-bordered w-full" value={manual.serviceDate} onChange={e=>setManual({...manual,serviceDate:e.target.value})}/></label><label htmlFor="transit-manual-service" className="form-control"><span className="label-text mb-1">Serviço</span><input id="transit-manual-service" className="input input-bordered w-full" value={manual.service} onChange={e=>setManual({...manual,service:e.target.value})}/></label><label htmlFor="transit-manual-days" className="form-control"><span className="label-text mb-1">Dias</span><input id="transit-manual-days" type="number" min="0" step="0.01" className="input input-bordered w-full" value={manual.days} onChange={e=>setManual({...manual,days:e.target.value})}/></label></div></ManualEntrySection><ManualEntrySection eyebrow="4. Financeiro" title="Valores"><div className="grid gap-4 md:grid-cols-2">{[["dailyAmount","Valor dia"],["previousMonthDifference","Dif. mês anterior"],["occasionalDiscounts","Descontos eventuais"]].map(([key,label])=><label key={key} className="form-control"><span className="label-text mb-1">{label}</span><input type="number" min="0" step="0.01" inputMode="decimal" placeholder="R$ 0,00" className="input input-bordered w-full" value={manual[key as keyof typeof manual]} onChange={e=>setManual({...manual,[key]:e.target.value})}/></label>)}<label htmlFor="transit-manual-total" className="form-control rounded-lg border border-primary/20 bg-primary/5 p-3"><span className="label-text mb-1 font-semibold text-primary">Valor total por colaborador *</span><input id="transit-manual-total" required type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="R$ 0,00" className={`input input-bordered w-full bg-base-100 text-lg font-bold ${manualEmployeeIds.length&&!(Number(manual.amount)>0)?"input-warning":""}`} value={manual.amount} onChange={e=>setManual({...manual,amount:e.target.value})}/><span className="mt-1 text-xs text-secondary">Valor padrão; pode ser ajustado individualmente abaixo.</span></label></div>{manualEmployeeIds.length>0&&<div className="mt-4 rounded-lg border border-base-300 bg-base-100"><button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left font-semibold" onClick={()=>setEditingIndividuals(value=>!value)}><span>Ajustar valores individuais</span><span className="text-primary">{editingIndividuals?"Ocultar":"Revisar"}</span></button>{editingIndividuals&&<div className="grid max-h-[32rem] gap-3 overflow-y-auto border-t border-base-300 p-3">{manualEmployeeIds.map(id=>{const employee=collaborators.find(item=>item.id===id);const values=individualValues[id]??{};return <fieldset key={id} className="rounded-lg border border-base-300 p-3"><legend className="px-1 text-sm font-bold">{employee?.officialName}</legend><p className="mb-3 text-xs text-secondary">{employee?.department} · {employee?.costCenter||"Sem centro de custo"}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["days","Dias"],["dailyAmount","Valor dia"],["previousMonthDifference","Dif. mês anterior"],["occasionalDiscounts","Descontos"],["amount","Valor total *"]].map(([key,label])=><label key={key} className="form-control"><span className="label-text mb-1 text-xs">{label}</span><input type="number" min="0" step="0.01" inputMode="decimal" className="input input-bordered input-sm w-full" value={values[key as keyof typeof manual]??manual[key as keyof typeof manual]} onChange={e=>setIndividualValues(current=>({...current,[id]:{...current[id],[key]:e.target.value}}))}/></label>)}</div></fieldset>})}</div>}</div>}</ManualEntrySection>{manualSuccess&&<div role="status" className="alert alert-success text-sm">{manualSuccess}</div>}{error&&<div role="alert" className="alert alert-error text-sm">{error}</div>}<div className="flex flex-col gap-2 md:items-end"><Button type="submit" disabled={busy||!manualReady} loading={busy} aura={manualReady} className="w-full md:w-auto md:min-w-64">{manualEmployeeIds.length<=1?"Salvar lançamento":`Salvar ${manualEmployeeIds.length} lançamentos`}</Button>{manualHint&&<p id="manual-transit-hint" className="text-xs text-secondary">{manualHint}</p>}</div></form>:<><h2 className="mb-4 text-lg font-bold">Upload</h2>
<div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-xl border border-base-300 bg-base-200 p-4 sm:flex-row sm:items-center">
<div><p className="font-semibold text-neutral">Ainda não possui o arquivo?</p><p className="text-sm text-secondary">Use a máscara oficial de Vale Transporte, compatível com este importador.</p></div>
<Link href="/api/accounts-payable/transit-voucher/template" className={buttonClassName({ variant: "secondary" })}>Baixar máscara XLSX</Link>
</div>
<form onSubmit={upload} className="grid gap-3 md:grid-cols-2">
<label className="form-control">
<span className="label-text mb-1">Competência</span>
<input type="month" value={competence} disabled={busy} onChange={(event) => setCompetence(event.target.value)} className="input input-bordered w-full"/>
</label>
<label className="form-control">
<span className="label-text mb-1">Cadastro da obrigação *</span>
<select required value={entityId} disabled={busy} onChange={(event) => setEntityId(event.target.value)} className="select select-bordered w-full">
<option value="">Selecionar cadastro de MA</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.tradeName} — {entity.legalName} — {formatCnpj(entity.cnpj)}</option>)}</select>
</label>
<label className="form-control md:col-span-2">
<span className="label-text mb-1">Arquivo Vale Transporte (CSV/XLSX) *</span>
<FileInput required accept=".csv,.xlsx" fileName={fileName} loading={busy} status={uploadStatus === "loading" ? "normal" : uploadStatus} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setFileName(selected?.name ?? ""); setUploadStatus("normal"); setError(null); }}/>
</label>
<Button type="submit" disabled={busy || !entityId || !file} loading={busy} aura className="md:col-span-2">{busy ? "Processando..." : maps.some((map) => map.administrativeEntity.id === entityId) ? "Enviar nova versão" : "Processar Vale Transporte"}</Button>
</form>{error && <div className="alert alert-error mt-4 text-sm">{error}</div>}{lastResult && <div className="alert alert-success mt-4 block text-sm"><strong>Arquivo processado com sucesso.</strong><p>{lastResult.totalRows} registros importados · {lastResult.validRows} válidos · {lastResult.invalidRows} pendências · {new Set(lastResult.allocations.map((row) => normalize(row.company))).size} empresas · {new Set(lastResult.allocations.map(employeeKey)).size} colaboradores únicos · {new Set(lastResult.allocations.map((row) => normalize(`${row.company}|${row.department}`))).size} departamentos · {money(lastResult.totalAmount)}</p></div>}<p className="mt-3 text-xs text-secondary">Obrigatórios: EMPRESA, NOME, DATA, DEPARTAMENTO e VALOR TOTAL. Os demais campos oficiais são preservados para auditoria.</p>
</>}
</section>
<section className="grid gap-4">
<h2 className="text-lg font-bold">Rateio</h2>{maps.length ? sortedPtBr(maps,map=>map.administrativeEntity.tradeName||map.administrativeEntity.legalName,(a,b)=>comparePtBr(a.id,b.id)).map((map) => <MapCard key={map.id} map={map} onReload={load}/>) : <div className="card"><EmptyState title="Nenhum arquivo processado nesta competência."/></div>}</section>
<Summary maps={maps}/>
</main>
</div>;
}
