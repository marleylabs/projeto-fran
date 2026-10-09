"use client";

// Listagem do catálogo de treinamentos. SÓ APRESENTAÇÃO: filtros e ações (visualizar, ativar/inativar) ficam na página.
import { Button, DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import { money } from "./format";
import type { Training } from "./types";

export function TrainingTable({ rows, loading, canManage, onView, onToggleActive }: { rows: Training[]; loading: boolean; canManage: boolean; onView: (item: Training) => void; onToggleActive: (item: Training) => void }) {
  const columns: DataTableColumn<Training>[] = [
    { id: "description", header: "Treinamento", rowHeader: true, sticky: "start", width: "16rem", wrap: true, cell: (item) => (
      <span className="grid min-w-0"><span>{item.description}</span><span className="text-caption font-normal text-foreground-muted">{item.supplier.tradeName}</span></span>
    ) },
    { id: "modality", header: "Modalidade", cell: (item) => item.modality },
    { id: "attendance", header: "Atendimento", cell: (item) => item.attendanceType },
    { id: "quantity", header: "Quantidade", numeric: true, cell: (item) => item.quantity },
    { id: "unit", header: "Valor unitário", numeric: true, cell: (item) => money(item.unitPrice) },
    { id: "additional", header: "Adicional/aluno", numeric: true, cell: (item) => money(item.additionalStudentPrice) },
    { id: "total", header: "Total", numeric: true, cell: (item) => <strong>{money(item.totalPrice)}</strong> },
    { id: "status", header: "Situação", cell: (item) => (item.active ? <StatusBadge tone="success">Ativo</StatusBadge> : <StatusBadge tone="neutral">Inativo</StatusBadge>) },
  ];
  return (
    <DataTable
      caption="Treinamentos cadastrados"
      columns={columns}
      rows={rows}
      getRowId={(item) => item.id}
      density="dense"
      minWidth="980px"
      loading={loading && rows.length === 0}
      loadingRows={6}
      actionsLabel="Ações"
      rowActions={(item) => (
        <span className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => onView(item)} aria-label={`Visualizar ${item.description}`}>Visualizar</Button>
          {canManage && <Button size="sm" variant="ghost" onClick={() => onToggleActive(item)} aria-label={`${item.active ? "Inativar" : "Ativar"} ${item.description}`}>{item.active ? "Inativar" : "Ativar"}</Button>}
        </span>
      )}
      empty={{ title: "Nenhum treinamento encontrado", description: "Ajuste os filtros ou importe uma nova proposta comercial." }}
    />
  );
}
