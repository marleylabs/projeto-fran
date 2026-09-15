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

function moneyHeader(label: string) {
  function Header() {
    return <span className="block text-right">{label}</span>;
  }
  Header.displayName = `MoneyHeader(${label})`;
  return Header;
}

function moneyCell(info: { getValue: () => number }) {
  return <span className="block text-right tabular-nums">{money(info.getValue())}</span>;
}
moneyCell.displayName = "MoneyCell";

export function SinteticoTable({ linhas }: { linhas: LinhaSintetico[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "nome", desc: false }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("mat", { header: "MAT", cell: (i) => <span className="tabular-nums">{i.getValue()}</span> }),
      columnHelper.accessor("nome", {
        header: "NOME",
        cell: (info) => (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{info.getValue() || "—"}</span>
            {info.row.original.camposBaixaConfianca.length > 0 && (
              <span
                title={`Campos com baixa confiança: ${info.row.original.camposBaixaConfianca.join(", ")}`}
                className="inline-flex items-center rounded-full bg-warning text-white text-[10px] font-bold w-4 h-4 justify-center shrink-0"
              >
                !
              </span>
            )}
          </div>
        ),
      }),
      columnHelper.accessor("ch", { header: "CH", cell: (i) => <span className="tabular-nums">{i.getValue()}</span> }),
      columnHelper.accessor("salario", { header: moneyHeader("SALARIO"), cell: moneyCell }),
      columnHelper.accessor("he", { header: moneyHeader("H.E"), cell: moneyCell }),
      columnHelper.accessor("dsr", { header: moneyHeader("DSR"), cell: moneyCell }),
      columnHelper.accessor("totalHE", { header: moneyHeader("TOTAL H.E"), cell: moneyCell }),
      columnHelper.accessor("salFamilia", { header: moneyHeader("SAL FAMILIA"), cell: moneyCell }),
      columnHelper.accessor("adcNoturno", { header: moneyHeader("ADC NOTURNO"), cell: moneyCell }),
      columnHelper.accessor("periculosidade", { header: moneyHeader("PERICULOSIDADE"), cell: moneyCell }),
      columnHelper.accessor("total", { header: moneyHeader("TOTAL"), cell: (i) => <span className="block text-right font-medium tabular-nums">{money(i.getValue())}</span> }),
      columnHelper.accessor("inss", { header: moneyHeader("INSS"), cell: moneyCell }),
      columnHelper.accessor("vt", { header: moneyHeader("VT"), cell: moneyCell }),
      columnHelper.accessor("descAut", { header: moneyHeader("DESC AUT"), cell: moneyCell }),
      columnHelper.accessor("ir", { header: moneyHeader("IR"), cell: moneyCell }),
      columnHelper.accessor("outros", { header: moneyHeader("OUTROS"), cell: moneyCell }),
      columnHelper.accessor("totalDesc", { header: moneyHeader("TOTAL DESC"), cell: moneyCell }),
      columnHelper.accessor("liquido", { header: moneyHeader("LIQUIDO"), cell: (i) => <span className="block text-right font-semibold text-primary tabular-nums">{money(i.getValue())}</span> }),
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
            <tr key={hg.id} className="bg-surface-soft border-b border-border">
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
