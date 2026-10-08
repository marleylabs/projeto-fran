"use client";

// Listagem de colaboradores (cadastro mestre). SÓ APRESENTAÇÃO: filtros, seleção e ações (editar, mesclar, inativar/
// reativar, excluir) ficam na página e chegam por props/callbacks. CPF e admissão só são formatados para leitura.
import type { ReactNode } from "react";
import { DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import { formatCpf } from "@/lib/cpf";
import { formatDateOnlyBR } from "@/lib/date-only";
import type { CollaboratorItem } from "./types";

const muted = (text: string) => <span className="text-foreground-muted">{text}</span>;

export function CollaboratorTable({ rows, selected, onSelectedChange, busy, renderActions, bulkActions }: { rows: CollaboratorItem[]; selected: string[]; onSelectedChange: (ids: string[]) => void; busy: boolean; renderActions: (item: CollaboratorItem) => ReactNode; bulkActions?: ReactNode }) {
  const columns: DataTableColumn<CollaboratorItem>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, sticky: "start", width: "16rem", cell: (item) => (
      <span className="grid min-w-0"><span className="truncate">{item.officialName}</span><span className="truncate text-caption font-normal text-foreground-muted">{item.jobTitle || "Sem função"}</span></span>
    ) },
    { id: "cpf", header: "CPF", cell: (item) => (item.cpf ? <span className="tabular-nums">{formatCpf(item.cpf)}</span> : muted("Não informado")) },
    { id: "department", header: "Departamento", cell: (item) => item.department },
    { id: "costCenter", header: "Centro de Custo", wrap: true, className: "min-w-[10rem] max-w-[15rem]", cell: (item) => item.costCenter || muted("Sem centro de custo") },
    { id: "admission", header: "Admissão", cell: (item) => (item.admissionDate ? <span className="tabular-nums">{formatDateOnlyBR(item.admissionDate)}</span> : muted("Não informada")) },
    { id: "status", header: "Situação", cell: (item) => (item.mergedIntoId ? <StatusBadge tone="info">Mesclado</StatusBadge> : item.active ? <StatusBadge tone="success">Ativo</StatusBadge> : <StatusBadge tone="neutral">Inativo</StatusBadge>) },
  ];
  return (
    <DataTable
      caption="Colaboradores cadastrados"
      columns={columns}
      rows={rows}
      getRowId={(item) => item.id}
      density="dense"
      minWidth="920px"
      maxHeight="70vh"
      selection={{ selectedIds: selected, onChange: onSelectedChange, getRowLabel: (item) => item.officialName, isRowSelectable: (item) => !item.mergedIntoId && !busy }}
      bulkActions={bulkActions}
      rowActions={renderActions}
      actionsLabel="Ações"
      empty={{ title: "Nenhum colaborador encontrado", description: "Ajuste a busca ou os filtros." }}
    />
  );
}
