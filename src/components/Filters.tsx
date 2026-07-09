"use client";

export interface FiltersState {
  empresa: string;
  nome: string;
  cpf: string;
  cargo: string;
  departamento: string;
  centroCusto: string;
  situacao: string;
}

export const EMPTY_FILTERS: FiltersState = {
  empresa: "",
  nome: "",
  cpf: "",
  cargo: "",
  departamento: "",
  centroCusto: "",
  situacao: "",
};

interface Props {
  filters: FiltersState;
  onChange: (filters: FiltersState) => void;
  empresasDisponiveis: string[];
  situacoesDisponiveis: string[];
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      />
    </label>
  );
}

export function Filters({ filters, onChange, empresasDisponiveis, situacoesDisponiveis }: Props) {
  const set = (key: keyof FiltersState) => (value: string) => onChange({ ...filters, [key]: value });

  const hasActiveFilters = Object.values(filters).some((v) => v.trim() !== "");

  return (
    <div className="card p-4 flex flex-wrap gap-3 items-end">
      {empresasDisponiveis.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-text-muted">Empresa</span>
          <select
            value={filters.empresa}
            onChange={(e) => set("empresa")(e.target.value)}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary bg-surface max-w-64"
          >
            <option value="">Todas</option>
            {empresasDisponiveis.map((empresa) => (
              <option key={empresa} value={empresa}>
                {empresa}
              </option>
            ))}
          </select>
        </label>
      )}
      <Field label="Nome" value={filters.nome} onChange={set("nome")} placeholder="Buscar por nome" />
      <Field label="CPF" value={filters.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
      <Field label="Cargo" value={filters.cargo} onChange={set("cargo")} placeholder="Buscar por cargo" />
      <Field label="Departamento" value={filters.departamento} onChange={set("departamento")} />
      <Field label="Centro de custo" value={filters.centroCusto} onChange={set("centroCusto")} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Situação</span>
        <select
          value={filters.situacao}
          onChange={(e) => set("situacao")(e.target.value)}
          className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary bg-surface"
        >
          <option value="">Todas</option>
          {situacoesDisponiveis.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {hasActiveFilters && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-sm text-primary hover:text-primary-hover font-medium px-2 py-1.5"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
