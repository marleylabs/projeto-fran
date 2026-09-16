"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CorporateHeader } from "@/components/CorporateHeader";
import { Button } from "@/components/ui";
import Link from "next/link";
import { formatCnpj, isValidCnpj } from "@/modules/administrative-entities/schema";

type Entity = { id: string; cnpj: string | null; legalName: string; tradeName: string; activityArea: string; appliesProjeta: boolean; appliesBoinga: boolean; locality: string };
type FormState = { cnpj: string; legalName: string; tradeName: string; activityArea: string; appliesProjeta: "" | "true" | "false"; appliesBoinga: "" | "true" | "false"; locality: string };
const EMPTY_FORM: FormState = { cnpj: "", legalName: "", tradeName: "", activityArea: "", appliesProjeta: "", appliesBoinga: "", locality: "" };

function maskCnpj(value: string) {
  return value.replace(/\D/g, "").slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

function YesNoBadge({ value }: { value: boolean }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${value ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{value ? "SIM" : "NÃO"}</span>;
}

export default function AdministrativeEntitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Entity[]>([]);
  const [filters, setFilters] = useState({ activityAreas: [] as string[], localities: [] as string[] });
  const [query, setQuery] = useState("");
  const [activityArea, setActivityArea] = useState("");
  const [locality, setLocality] = useState("");
  const [appliesProjeta, setAppliesProjeta] = useState("");
  const [appliesBoinga, setAppliesBoinga] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const value = new URLSearchParams();
    if (query.trim()) value.set("q", query.trim());
    if (activityArea) value.set("activityArea", activityArea);
    if (locality) value.set("locality", locality);
    if (appliesProjeta) value.set("appliesProjeta", appliesProjeta);
    if (appliesBoinga) value.set("appliesBoinga", appliesBoinga);
    return value.toString();
  }, [query, activityArea, locality, appliesProjeta, appliesBoinga]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/administrative-entities?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar os cadastros.");
      setItems(body.items ?? []);
      setFilters(body.filters ?? { activityAreas: [], localities: [] });
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar os cadastros."); }
    finally { setLoading(false); }
  }, [params]);

  useEffect(() => { const timeout = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timeout); }, [load]);
  useEffect(() => { fetch("/api/auth/me").then((response) => response.json()).then((me) => setCurrentUserEmail(me.email ?? null)).catch(() => undefined); }, []);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false); };
  const edit = (item: Entity) => {
    setForm({ cnpj: item.cnpj ? formatCnpj(item.cnpj) : "", legalName: item.legalName, tradeName: item.tradeName, activityArea: item.activityArea, appliesProjeta: String(item.appliesProjeta) as "true" | "false", appliesBoinga: String(item.appliesBoinga) as "true" | "false", locality: item.locality });
    setEditingId(item.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits && !isValidCnpj(digits)) return setError("Informe um CNPJ válido.");
    if (form.appliesProjeta === "" || form.appliesBoinga === "") return setError("Selecione explicitamente SIM ou NÃO para Projeta e Boinga.");
    setSaving(true); setError(null);
    try {
      const response = await fetch(editingId ? `/api/administrative-entities/${editingId}` : "/api/administrative-entities", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cnpj: digits || null, appliesProjeta: form.appliesProjeta === "true", appliesBoinga: form.appliesBoinga === "true" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao salvar o cadastro.");
      resetForm(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar o cadastro."); }
    finally { setSaving(false); }
  };

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };

  return <div className="flex flex-1 flex-col">
    <CorporateHeader currentUserEmail={currentUserEmail} onLogout={logout} />
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Gestão administrativa</p><h1 className="text-2xl font-bold text-foreground">Cadastro geral de entidades</h1><p className="mt-1 text-sm text-text-muted">Favorecidos, obrigações e entidades usados pelo setor Administrativo.</p><Link href="/cadastros/colaboradores" className="mt-3 inline-flex font-semibold text-primary">Gerenciar colaboradores →</Link></div><Button aura onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>Novo cadastro</Button></div>

      {showForm && <form onSubmit={submit} className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center justify-between md:col-span-2 xl:col-span-4"><h2 className="font-semibold">{editingId ? "Editar cadastro" : "Novo cadastro"}</h2><Button type="button" onClick={resetForm} variant="ghost" size="sm">Cancelar</Button></div>
        <label className="flex flex-col gap-1 text-sm"><span>CNPJ <span className="text-text-muted">(opcional)</span></span><input value={form.cnpj} onChange={(event) => setForm({ ...form, cnpj: maskCnpj(event.target.value) })} placeholder="00.000.000/0000-00" inputMode="numeric" className="rounded-md border border-border px-3 py-2" /></label>
        <label className="flex flex-col gap-1 text-sm xl:col-span-2"><span>Razão social</span><input required value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} className="rounded-md border border-border px-3 py-2" /></label>
        <label className="flex flex-col gap-1 text-sm"><span>Nome fantasia</span><input required value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} className="rounded-md border border-border px-3 py-2" /></label>
        <label className="flex flex-col gap-1 text-sm xl:col-span-2"><span>Área de atuação</span><input required list="activity-area-options" value={form.activityArea} onChange={(event) => setForm({ ...form, activityArea: event.target.value })} className="rounded-md border border-border px-3 py-2" /><datalist id="activity-area-options">{filters.activityAreas.map((value) => <option key={value} value={value} />)}</datalist></label>
        <label className="flex flex-col gap-1 text-sm"><span>Projeta</span><select required value={form.appliesProjeta} onChange={(event) => setForm({ ...form, appliesProjeta: event.target.value as FormState["appliesProjeta"] })} className="rounded-md border border-border px-3 py-2"><option value="">Selecione</option><option value="true">SIM</option><option value="false">NÃO</option></select></label>
        <label className="flex flex-col gap-1 text-sm"><span>Boinga</span><select required value={form.appliesBoinga} onChange={(event) => setForm({ ...form, appliesBoinga: event.target.value as FormState["appliesBoinga"] })} className="rounded-md border border-border px-3 py-2"><option value="">Selecione</option><option value="true">SIM</option><option value="false">NÃO</option></select></label>
        <label className="flex flex-col gap-1 text-sm xl:col-span-2"><span>Localidade</span><input required list="locality-options" value={form.locality} onChange={(event) => setForm({ ...form, locality: event.target.value })} className="rounded-md border border-border px-3 py-2" /><datalist id="locality-options">{filters.localities.map((value) => <option key={value} value={value} />)}</datalist></label>
        <div className="flex items-end xl:col-span-2"><Button type="submit" aura loading={saving} disabled={saving} className="w-full">{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar cadastro"}</Button></div>
      </form>}

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <section className="card p-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6"><input aria-label="Pesquisar cadastros" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por CNPJ, razão ou fantasia" className="rounded-md border border-border px-3 py-2 xl:col-span-2" /><select aria-label="Filtrar área" value={activityArea} onChange={(event) => setActivityArea(event.target.value)} className="rounded-md border border-border px-3 py-2"><option value="">Todas as áreas</option>{filters.activityAreas.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filtrar Projeta" value={appliesProjeta} onChange={(event) => setAppliesProjeta(event.target.value)} className="rounded-md border border-border px-3 py-2"><option value="">Projeta: todos</option><option value="true">Projeta: SIM</option><option value="false">Projeta: NÃO</option></select><select aria-label="Filtrar Boinga" value={appliesBoinga} onChange={(event) => setAppliesBoinga(event.target.value)} className="rounded-md border border-border px-3 py-2"><option value="">Boinga: todos</option><option value="true">Boinga: SIM</option><option value="false">Boinga: NÃO</option></select><select aria-label="Filtrar localidade" value={locality} onChange={(event) => setLocality(event.target.value)} className="rounded-md border border-border px-3 py-2"><option value="">Todas as localidades</option>{filters.localities.map((value) => <option key={value}>{value}</option>)}</select></div></section>

      <div className="card overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b border-border bg-slate-50"><th className="p-3 text-left">CNPJ</th><th className="p-3 text-left">Razão social</th><th className="p-3 text-left">Nome fantasia</th><th className="p-3 text-left">Área de atuação</th><th className="p-3 text-center">Projeta</th><th className="p-3 text-center">Boinga</th><th className="p-3 text-left">Localidade</th><th className="p-3 text-right">Ações</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-b border-border last:border-0"><td className="whitespace-nowrap p-3 text-text-muted">{formatCnpj(item.cnpj)}</td><td className="p-3 font-medium">{item.legalName}</td><td className="p-3">{item.tradeName}</td><td className="p-3">{item.activityArea}</td><td className="p-3 text-center"><YesNoBadge value={item.appliesProjeta} /></td><td className="p-3 text-center"><YesNoBadge value={item.appliesBoinga} /></td><td className="p-3">{item.locality}</td><td className="p-3 text-right"><Button onClick={() => edit(item)} variant="ghost" size="sm">Editar</Button></td></tr>)}
        {!loading && items.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-text-muted">Nenhum cadastro encontrado.</td></tr>}{loading && <tr><td colSpan={8} className="p-10 text-center text-text-muted">Carregando cadastros...</td></tr>}
      </tbody></table></div>
    </main>
  </div>;
}
