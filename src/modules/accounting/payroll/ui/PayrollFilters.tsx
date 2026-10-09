"use client";

// Filtros do Extrato Mensal. SÓ APRESENTAÇÃO: o estado (FiltersState) e a filtragem ficam no PayrollWorkspace, com a
// mesma semântica de antes (empresa/situação exatas; nome/cargo contém; CPF contém; depto/CC igual ou contém).
// Padrão do FilterBar: busca + Empresa + Situação inline; CPF, Cargo, Departamento e Centro de custo em "Filtros
// avançados" (aplicam ao digitar, o painel só agrupa) para não empilhar 7 campos em telas estreitas.
import type { ReactNode } from "react";
import { Field, FilterBar, SearchInput, TextInput, textInputClassName } from "@/components/ui";

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

const ADVANCED: [keyof FiltersState, string, string?][] = [["cpf", "CPF", "000.000.000-00"], ["cargo", "Cargo"], ["departamento", "Departamento"], ["centroCusto", "Centro de custo"]];

export function PayrollFilters({ filters, onChange, empresasDisponiveis, situacoesDisponiveis, actions }: { filters: FiltersState; onChange: (filters: FiltersState) => void; empresasDisponiveis: string[]; situacoesDisponiveis: string[]; actions?: ReactNode }) {
  const set = (key: keyof FiltersState) => (value: string) => onChange({ ...filters, [key]: value });
  const activeCount = Object.values(filters).filter((value) => value.trim() !== "").length;
  const advancedCount = ADVANCED.filter(([key]) => filters[key].trim() !== "").length;
  return (
    <FilterBar
      label="Filtros de colaboradores"
      search={<SearchInput label="Buscar por nome" placeholder="Buscar por nome" value={filters.nome} onValueChange={set("nome")} />}
      activeCount={activeCount}
      onClear={() => onChange(EMPTY_FILTERS)}
      actions={actions}
      advanced={{
        title: "Filtros avançados de colaboradores",
        activeCount: advancedCount,
        content: ADVANCED.map(([key, label, placeholder]) => (
          <Field key={key} label={label}>{(control) => <TextInput {...control} placeholder={placeholder} value={filters[key]} onChange={(event) => set(key)(event.target.value)} />}</Field>
        )),
      }}
    >
      {empresasDisponiveis.length > 1 && (
        <select aria-label="Filtrar empresa" value={filters.empresa} onChange={(event) => set("empresa")(event.target.value)} className={textInputClassName}>
          <option value="">Todas as empresas</option>
          {empresasDisponiveis.map((empresa) => <option key={empresa} value={empresa}>{empresa}</option>)}
        </select>
      )}
      <select aria-label="Filtrar situação" value={filters.situacao} onChange={(event) => set("situacao")(event.target.value)} className={textInputClassName}>
        <option value="">Todas as situações</option>
        {situacoesDisponiveis.map((situacao) => <option key={situacao} value={situacao}>{situacao}</option>)}
      </select>
    </FilterBar>
  );
}
