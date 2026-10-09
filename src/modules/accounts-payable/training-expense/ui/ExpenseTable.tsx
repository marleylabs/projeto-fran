"use client";

// Lançamentos de treinamento da competência. SÓ APRESENTAÇÃO: filtros (na API) e abertura do detalhe ficam na página.
import { Eye } from "lucide-react";
import { Button, DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import { dateBr, money } from "@/modules/trainings/ui/format";
import { EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, type ExpenseListItem } from "./types";

export function ExpenseTable({ rows, loading, onView }: { rows: ExpenseListItem[]; loading: boolean; onView: (id: string) => void }) {
  const columns: DataTableColumn<ExpenseListItem>[] = [
    { id: "training", header: "Treinamento", rowHeader: true, sticky: "start", width: "18rem", wrap: true, cell: (item) => item.training.description },
    { id: "date", header: "Data", cell: (item) => <span className="tabular-nums">{dateBr(item.trainingDate)}</span> },
    { id: "supplier", header: "Fornecedor", wrap: true, cell: (item) => item.supplier.tradeName },
    { id: "participants", header: "Participantes", numeric: true, cell: (item) => item.participantCount },
    { id: "amount", header: "Valor", numeric: true, cell: (item) => <strong>{money(item.finalAmount)}</strong> },
    { id: "status", header: "Status", cell: (item) => <StatusBadge tone={EXPENSE_STATUS_TONE[item.status]}>{EXPENSE_STATUS_LABEL[item.status]}</StatusBadge> },
  ];
  return (
    <DataTable
      caption="Lançamentos de treinamento da competência"
      columns={columns}
      rows={rows}
      getRowId={(item) => item.id}
      density="dense"
      minWidth="860px"
      loading={loading && rows.length === 0}
      loadingRows={4}
      actionsLabel="Ações"
      rowActions={(item) => <Button size="sm" variant="ghost" onClick={() => onView(item.id)} aria-label={`Visualizar ${item.training.description} de ${dateBr(item.trainingDate)}`}><Eye size={14} aria-hidden="true" />Visualizar</Button>}
      empty={{ title: "Nenhum lançamento nesta competência", description: "Registre um treinamento realizado para começar." }}
    />
  );
}
