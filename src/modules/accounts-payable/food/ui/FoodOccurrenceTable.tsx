"use client";

// Gestão de ocorrências de um lote editável (busca, seleção e exclusão). SÓ APRESENTAÇÃO: o filtro, a seleção e a chamada
// de exclusão (sempre via DeletionModal, com motivo) continuam na página; aqui só se exibem as linhas e os gatilhos.
import { Trash2 } from "lucide-react";
import { Button, DataTable, type DataTableColumn } from "@/components/ui";
import { dateBr, money } from "./format";

export type FoodOccurrenceRow = { id: string; name: string; occurredOn: string | null; mealQuantity: number; department: string; amount: string };

export function FoodOccurrenceTable({ rows, selected, onSelectedChange, onDelete }: { rows: FoodOccurrenceRow[]; selected: string[]; onSelectedChange: (ids: string[]) => void; onDelete: (ids: string[]) => void }) {
  const columns: DataTableColumn<FoodOccurrenceRow>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "16rem", cell: (row) => <span className="block truncate">{row.name}</span> },
    { id: "date", header: "Data", cell: (row) => (row.occurredOn ? <span className="tabular-nums">{dateBr(row.occurredOn)}</span> : "—") },
    { id: "meals", header: "Refeições", numeric: true, cell: (row) => row.mealQuantity },
    { id: "department", header: "Setor", cell: (row) => row.department },
    { id: "amount", header: "Valor", numeric: true, cell: (row) => money(row.amount) },
  ];
  return (
    <DataTable
      caption="Lançamentos e refeições do lote"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      density="dense"
      minWidth="720px"
      maxHeight="20rem"
      selection={{ selectedIds: selected, onChange: onSelectedChange, getRowLabel: (row) => row.name }}
      rowActions={(row) => <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => onDelete([row.id])} aria-label={`Excluir ocorrência de ${row.name}`}><Trash2 size={14} aria-hidden="true" />Excluir</Button>}
      empty={{ title: "Nenhuma ocorrência encontrada com esse filtro." }}
    />
  );
}
