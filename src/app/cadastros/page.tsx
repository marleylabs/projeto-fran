"use client";

// Cadastros → cadastro geral de entidades administrativas (favorecidos, obrigações e fornecedores usados pelo
// Administrativo). Fase 7I: apresentação no Design System (PageHeader, FilterBar/SearchInput, DataTable, Dialog com
// Field). Busca/filtros na API, payload, validação de CNPJ e a escolha explícita SIM/NÃO continuam AQUI, sem mudança
// de regra. Company (empresa do rateio) é outro cadastro e não é tratado aqui.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button, Dialog, FeedbackAlert, FilterBar, PageHeader, SearchInput, buttonClassName, textInputClassName } from "@/components/ui";
import { formatCnpj, isValidCnpj } from "@/modules/administrative-entities/schema";
import { EntityFormFields } from "@/modules/administrative-entities/ui/EntityFormFields";
import { EntityTable } from "@/modules/administrative-entities/ui/EntityTable";
import type { AdministrativeEntityForm as FormState, AdministrativeEntityItem as Entity } from "@/modules/administrative-entities/ui/types";

const EMPTY_FORM: FormState = { cnpj: "", legalName: "", tradeName: "", activityArea: "", appliesProjeta: "", appliesBoinga: "", locality: "" };

function maskCnpj(value: string) {
  return value.replace(/\D/g, "").slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

export default function AdministrativeEntitiesPage() {
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
  const [error, setError] = useState<string | null>(null);
  // Erros do formulário ficam no próprio Dialog: CNPJ e SIM/NÃO junto do campo; erro do servidor em FeedbackAlert.
  const [formError, setFormError] = useState<string | null>(null);
  const [cnpjError, setCnpjError] = useState<string | undefined>(undefined);
  const [choiceError, setChoiceError] = useState<string | undefined>(undefined);
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

  const clearFormErrors = () => { setFormError(null); setCnpjError(undefined); setChoiceError(undefined); };
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false); clearFormErrors(); };
  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); clearFormErrors(); setShowForm(true); };
  const edit = (item: Entity) => {
    setForm({ cnpj: item.cnpj ? formatCnpj(item.cnpj) : "", legalName: item.legalName, tradeName: item.tradeName, activityArea: item.activityArea, appliesProjeta: String(item.appliesProjeta) as "true" | "false", appliesBoinga: String(item.appliesBoinga) as "true" | "false", locality: item.locality });
    setEditingId(item.id); clearFormErrors(); setShowForm(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = form.cnpj.replace(/\D/g, "");
    clearFormErrors();
    if (digits && !isValidCnpj(digits)) return setCnpjError("Informe um CNPJ válido.");
    if (form.appliesProjeta === "" || form.appliesBoinga === "") return setChoiceError("Selecione explicitamente SIM ou NÃO para Projeta e Boinga.");
    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/administrative-entities/${editingId}` : "/api/administrative-entities", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cnpj: digits || null, appliesProjeta: form.appliesProjeta === "true", appliesBoinga: form.appliesBoinga === "true" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao salvar o cadastro.");
      resetForm(); await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Falha ao salvar o cadastro."); }
    finally { setSaving(false); }
  };

  const activeFilters = [query.trim(), activityArea, locality, appliesProjeta, appliesBoinga].filter(Boolean).length;

  return <div className="flex flex-1 flex-col">
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Gestão administrativa"
        title="Cadastro geral de entidades"
        description="Favorecidos, obrigações e entidades usados pelo setor Administrativo."
        actions={<>
          <Link href="/cadastros/colaboradores" className={buttonClassName({ variant: "secondary" })}>Gerenciar colaboradores<ArrowRight size={16} aria-hidden="true" /></Link>
          <Button aura onClick={openNew}><Plus size={16} aria-hidden="true" />Novo cadastro</Button>
        </>}
      />

      {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
      <FilterBar
        label="Filtros de cadastros"
        search={<SearchInput label="Pesquisar cadastros" placeholder="Buscar por CNPJ, razão ou fantasia" value={query} onValueChange={setQuery} />}
        activeCount={activeFilters}
        onClear={() => { setQuery(""); setActivityArea(""); setLocality(""); setAppliesProjeta(""); setAppliesBoinga(""); }}
      >
        <select aria-label="Filtrar área" value={activityArea} onChange={(event) => setActivityArea(event.target.value)} className={textInputClassName}><option value="">Todas as áreas</option>{filters.activityAreas.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="Filtrar Projeta" value={appliesProjeta} onChange={(event) => setAppliesProjeta(event.target.value)} className={textInputClassName}><option value="">Projeta: todos</option><option value="true">Projeta: SIM</option><option value="false">Projeta: NÃO</option></select>
        <select aria-label="Filtrar Boinga" value={appliesBoinga} onChange={(event) => setAppliesBoinga(event.target.value)} className={textInputClassName}><option value="">Boinga: todos</option><option value="true">Boinga: SIM</option><option value="false">Boinga: NÃO</option></select>
        <select aria-label="Filtrar localidade" value={locality} onChange={(event) => setLocality(event.target.value)} className={textInputClassName}><option value="">Todas as localidades</option>{filters.localities.map((value) => <option key={value}>{value}</option>)}</select>
      </FilterBar>

      <p className="text-body text-foreground-muted tabular-nums" role="status">{loading ? "Carregando cadastros..." : `${items.length} cadastro(s)`}</p>
      <EntityTable rows={items} loading={loading} onEdit={edit} />

      <Dialog
        open={showForm}
        onClose={() => { if (!saving) resetForm(); }}
        dismissible={!saving}
        size="lg"
        title={editingId ? "Editar cadastro" : "Novo cadastro"}
        description="O servidor normaliza e valida CNPJ e campos obrigatórios ao salvar."
        footer={<><Button variant="secondary" disabled={saving} onClick={resetForm}>Cancelar</Button><Button type="submit" form="administrative-entity-form" aura loading={saving} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar cadastro"}</Button></>}
      >
        <div className="grid gap-4">
          {formError && <FeedbackAlert status="error">{formError}</FeedbackAlert>}
          <EntityFormFields
            formId="administrative-entity-form"
            form={form}
            activityAreas={filters.activityAreas}
            localities={filters.localities}
            cnpjError={cnpjError}
            choiceError={choiceError}
            onChange={(patch) => setForm({ ...form, ...patch })}
            onCnpjChange={(value) => { setForm({ ...form, cnpj: maskCnpj(value) }); setCnpjError(undefined); }}
            onSubmit={submit}
          />
        </div>
      </Dialog>
    </main>
  </div>;
}
