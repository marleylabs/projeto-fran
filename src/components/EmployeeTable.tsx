"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import type { Colaborador } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";
import { StatusBadge } from "./StatusBadge";

const columnHelper = createColumnHelper<Colaborador>();

interface Props {
  colaboradores: Colaborador[];
  onVerDetalhes: (id: string) => void;
}

export function EmployeeTable({ colaboradores, onVerDetalhes }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "nome", desc: false }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("codigo", { header: "Código", cell: (info) => info.getValue() || "—" }),
      columnHelper.accessor("nome", {
        header: "Nome",
        cell: (info) => (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{info.getValue() || "—"}</span>
            {info.row.original.camposBaixaConfianca.length > 0 && (
              <span
                title={`Campos com baixa confiança: ${info.row.original.camposBaixaConfianca.join(", ")}`}
                className="inline-flex items-center rounded-full bg-amber-400 text-white text-[10px] font-bold w-4 h-4 justify-center shrink-0"
              >
                !
              </span>
            )}
          </div>
        ),
      }),
      columnHelper.accessor("empresaNome", { header: "Empresa", cell: (info) => info.getValue() || "—" }),
      columnHelper.accessor("cpf", { header: "CPF", cell: (info) => info.getValue() || "—" }),
      columnHelper.accessor("cargo", { header: "Cargo", cell: (info) => info.getValue() || "—" }),
      columnHelper.accessor("departamento", { header: "Depto", cell: (info) => info.getValue() || "—" }),
      columnHelper.accessor("centroCusto", { header: "CC", cell: (info) => info.getValue() || "—" }),
      columnHelper.accessor("situacao", { header: "Situação", cell: (info) => <StatusBadge situacao={info.getValue()} /> }),
      columnHelper.accessor("liquido", {
        header: "Líquido",
        cell: (info) => `R$ ${formatBRNumber(info.getValue())}`,
      }),
      columnHelper.display({
        id: "acoes",
        header: "",
        cell: (info) => (
          <button
            onClick={() => onVerDetalhes(info.row.original.id)}
            className="text-sm font-medium text-primary hover:text-primary-hover whitespace-nowrap"
          >
            Ver detalhes
          </button>
        ),
      }),
    ],
    [onVerDetalhes]
  );

  const table = useReactTable({
    data: colaboradores,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="card overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm border-collapse min-w-[980px]">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-soft">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                Nenhum colaborador encontrado para os filtros aplicados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
