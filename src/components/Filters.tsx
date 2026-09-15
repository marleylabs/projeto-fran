"use client";

import { Search, X } from "lucide-react";

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
  withIcon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  withIcon?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm w-full sm:w-auto">
      <span className="field-label">{label}</span>
      <div className="relative">
        {withIcon && <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth={1.75} />}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`field-input w-full ${withIcon ? "pl-8" : ""}`}
        />
      </div>
    </label>
  );
}

export function Filters({ filters, onChange, empresasDisponiveis, situacoesDisponiveis }: Props) {
  const set = (key: keyof FiltersState) => (value: string) => onChange({ ...filters, [key]: value });

  const hasActiveFilters = Object.values(filters).some((v) => v.trim() !== "");

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Filtros</h3>
        {hasActiveFilters && (
          <button onClick={() => onChange(EMPTY_FILTERS)} className="btn btn-ghost btn-sm">
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            Limpar filtros
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        {empresasDisponiveis.length > 1 && (
          <label className="flex flex-col gap-1 text-sm w-full sm:w-auto">
            <span className="field-label">Empresa</span>
            <select
              value={filters.empresa}
              onChange={(e) => set("empresa")(e.target.value)}
              className="field-input bg-surface w-full sm:max-w-64"
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
        <Field label="Nome" value={filters.nome} onChange={set("nome")} placeholder="Buscar por nome" withIcon />
        <Field label="CPF" value={filters.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
        <Field label="Cargo" value={filters.cargo} onChange={set("cargo")} placeholder="Buscar por cargo" />
        <Field label="Departamento" value={filters.departamento} onChange={set("departamento")} />
        <Field label="Centro de custo" value={filters.centroCusto} onChange={set("centroCusto")} />

        <label className="flex flex-col gap-1 text-sm w-full sm:w-auto">
          <span className="field-label">Situação</span>
          <select
            value={filters.situacao}
            onChange={(e) => set("situacao")(e.target.value)}
            className="field-input bg-surface w-full"
          >
            <option value="">Todas</option>
            {situacoesDisponiveis.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
