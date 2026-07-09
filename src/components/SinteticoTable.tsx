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
import type { LinhaSintetico } from "@/lib/types/sintetico";
import { formatBRNumber } from "@/lib/normalize/money";

const columnHelper = createColumnHelper<LinhaSintetico>();

function money(v: number) {
  return `R$ ${formatBRNumber(v)}`;
}

export function SinteticoTable({ linhas }: { linhas: LinhaSintetico[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "nome", desc: false }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("mat", { header: "MAT" }),
      columnHelper.accessor("nome", {
        header: "NOME",
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
      columnHelper.accessor("ch", { header: "CH" }),
      columnHelper.accessor("salario", { header: "SALARIO", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("he", { header: "H.E", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("dsr", { header: "DSR", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("totalHE", { header: "TOTAL H.E", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("salFamilia", { header: "SAL FAMILIA", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("adcNoturno", { header: "ADC NOTURNO", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("periculosidade", { header: "PERICULOSIDADE", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("total", { header: "TOTAL", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("inss", { header: "INSS", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("vt", { header: "VT", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("descAut", { header: "DESC AUT", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("ir", { header: "IR", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("outros", { header: "OUTROS", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("totalDesc", { header: "TOTAL DESC", cell: (i) => money(i.getValue()) }),
      columnHelper.accessor("liquido", { header: "LIQUIDO", cell: (i) => money(i.getValue()) }),
    ],
    []
  );

  const table = useReactTable({
    data: linhas,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="card overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm border-collapse min-w-[1400px]">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="text-left px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
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
                <td key={cell.id} className="px-3 py-2 align-middle whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                Nenhum colaborador encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
