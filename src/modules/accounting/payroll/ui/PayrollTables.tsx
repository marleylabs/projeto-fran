"use client";

// Tabelas da Folha (Extrato Mensal e Relatório Sintético). SÓ APRESENTAÇÃO: as linhas chegam filtradas do
// PayrollWorkspace; aqui só ordenação de exibição (por coluna, como antes) e indicação de baixa confiança de leitura
// (campos sinalizados pelo próprio parser — nenhuma nova semântica de confiança).
import { useMemo, useState } from "react";
import { AlertTriangle, Eye } from "lucide-react";
import { Button, DataTable, StatusBadge, Tooltip, type DataTableColumn, type DataTableSort } from "@/components/ui";
import type { Colaborador } from "@/lib/types/payroll";
import type { LinhaSintetico } from "@/lib/types/sintetico";
import { brl, situacaoTone, sortRows } from "./format";

/** Baixa confiança de leitura sinalizada pelo parser: badge visível + Tooltip (antes ficava só em title=). Sem lista de
 *  campos (ex.: rubrica), mostra a mensagem genérica. */
export function LowConfidence({ fields, generic = false }: { fields?: string[]; generic?: boolean }) {
  if (!generic && !fields?.length) return null;
  const message = generic || !fields?.length ? "Baixa confiança de leitura" : `Baixa confiança de leitura: ${fields.join(", ")}`;
  return (
    <Tooltip content={message}>
      <button type="button" className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-caption font-medium text-warning-text" aria-label={message}>
        <AlertTriangle size={12} aria-hidden="true" />Revisar
      </button>
    </Tooltip>
  );
}

const dash = (value: string | undefined | null) => value || <span className="text-foreground-muted">—</span>;

export function PayrollEmployeeTable({ colaboradores, onVerDetalhes }: { colaboradores: Colaborador[]; onVerDetalhes: (id: string) => void }) {
  const [sort, setSort] = useState<DataTableSort | null>({ key: "nome", direction: "asc" });
  const rows = useMemo(() => sortRows(colaboradores, sort, (c, key) => (key === "liquido" ? c.liquido : String((c as unknown as Record<string, unknown>)[key] ?? ""))), [colaboradores, sort]);
  const columns: DataTableColumn<Colaborador>[] = [
    { id: "nome", header: "Nome", rowHeader: true, sticky: "start", width: "13rem", sortable: true, wrap: true, cell: (c) => (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5"><span>{c.nome || "—"}</span><LowConfidence fields={c.camposBaixaConfianca} />{c.revisadoManualmente && <StatusBadge tone="info">Revisado</StatusBadge>}</span>
    ) },
    { id: "codigo", header: "Código", sortable: true, cell: (c) => <span className="tabular-nums">{dash(c.codigo)}</span> },
    { id: "empresaNome", header: "Empresa", sortable: true, wrap: true, className: "min-w-[8rem]", cell: (c) => dash(c.empresaNome) },
    { id: "cpf", header: "CPF", sortable: true, cell: (c) => <span className="tabular-nums">{dash(c.cpf)}</span> },
    { id: "cargo", header: "Cargo", sortable: true, wrap: true, cell: (c) => dash(c.cargo) },
    { id: "departamento", header: "Depto", sortable: true, wrap: true, cell: (c) => dash(c.departamento) },
    { id: "centroCusto", header: "CC", sortable: true, wrap: true, cell: (c) => dash(c.centroCusto) },
    { id: "situacao", header: "Situação", sortable: true, cell: (c) => <StatusBadge tone={situacaoTone(c.situacao)}>{c.situacao || "—"}</StatusBadge> },
    { id: "liquido", header: "Líquido", numeric: true, sortable: true, cell: (c) => brl(c.liquido) },
  ];
  return (
    <DataTable
      caption="Colaboradores do Extrato Mensal"
      columns={columns}
      rows={rows}
      getRowId={(c) => c.id}
      density="dense"
      minWidth="960px"
      maxHeight="70vh"
      sort={sort}
      onSortChange={setSort}
      actionsLabel="Ações"
      rowActions={(c) => <Tooltip content="Ver detalhes"><Button size="sm" variant="ghost" onClick={() => onVerDetalhes(c.id)} aria-label={`Ver detalhes de ${c.nome || c.codigo}`}><Eye size={16} aria-hidden="true" /></Button></Tooltip>}
      empty={{ title: "Nenhum colaborador encontrado", description: "Ajuste os filtros aplicados." }}
    />
  );
}

const SINTETICO_MONEY: [keyof LinhaSintetico, string][] = [
  ["salario", "Salário"], ["he", "H.E"], ["dsr", "DSR"], ["totalHE", "Total H.E"], ["salFamilia", "Sal. família"], ["adcNoturno", "Adc. noturno"],
  ["periculosidade", "Periculosidade"], ["total", "Total"], ["inss", "INSS"], ["vt", "VT"], ["descAut", "Desc. aut."], ["ir", "IR"], ["outros", "Outros"],
  ["totalDesc", "Total desc."], ["liquido", "Líquido"],
];

export function PayrollSinteticoTable({ linhas }: { linhas: LinhaSintetico[] }) {
  const [sort, setSort] = useState<DataTableSort | null>({ key: "nome", direction: "asc" });
  const rows = useMemo(() => sortRows(linhas, sort, (l, key) => { const value = (l as unknown as Record<string, unknown>)[key]; return typeof value === "number" ? value : String(value ?? ""); }), [linhas, sort]);
  const columns: DataTableColumn<LinhaSintetico>[] = [
    { id: "nome", header: "Nome", rowHeader: true, sticky: "start", width: "16rem", sortable: true, wrap: true, cell: (l) => <span className="flex min-w-0 flex-wrap items-center gap-1.5"><span>{l.nome || "—"}</span><LowConfidence fields={l.camposBaixaConfianca} /></span> },
    { id: "mat", header: "Mat.", sortable: true, cell: (l) => <span className="tabular-nums">{l.mat}</span> },
    { id: "ch", header: "CH", sortable: true, cell: (l) => <span className="tabular-nums">{l.ch}</span> },
    ...SINTETICO_MONEY.map(([key, header]): DataTableColumn<LinhaSintetico> => ({ id: key, header, numeric: true, sortable: true, cell: (l) => brl(l[key] as number) })),
  ];
  return (
    <DataTable
      caption="Linhas do Relatório Sintético"
      columns={columns}
      rows={rows}
      getRowId={(l) => l.id}
      density="dense"
      minWidth="1680px"
      maxHeight="70vh"
      sort={sort}
      onSortChange={setSort}
      empty={{ title: "Nenhum colaborador encontrado", description: "Ajuste a busca." }}
    />
  );
}
