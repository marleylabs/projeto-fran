"use client";

// Tabela de preenchimento do Café da Manhã. SÓ APRESENTAÇÃO: Quantidade Final e Total chegam prontos da prévia da
// BreakfastSection (calculateFinalQuantity / calculateBreakfastEmployeeTotal); aqui só se exibe a leitura da linha
// (base − desconto + extras = final × valor = total) e se repassa a digitação por callback. O servidor recalcula ao salvar.
import { Calculator } from "lucide-react";
import { DataTable, TextInput, textInputClassName, type DataTableColumn } from "@/components/ui";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { formatBreakfastObservation } from "../calculations";
import { Note } from "@/modules/accounts-payable/basic-basket/ui/parts";
import { money, moneyCents, people } from "./format";
import type { BreakfastEntryValue } from "./types";

export type BreakfastFillRow = { id: string; employee: CollaboratorOption | undefined; error: string | null; finalQuantity: number; total: number };

type Props = {
  rows: BreakfastFillRow[];
  values: Record<string, BreakfastEntryValue>;
  baseDays: number;
  unitPrice: string | undefined;
  companyListId: string;
  previewTotal: number;
  onPatch: (id: string, patch: Partial<BreakfastEntryValue>) => void;
  onCompanyText: (id: string, text: string) => void;
};

// Quantidade calculada: superfície de valor calculado (não parece campo editável).
function CalculatedQuantity({ value, strong = false }: { value: number | string; strong?: boolean }) {
  return (
    <span className="inline-flex min-w-11 items-center justify-end gap-1 rounded-control bg-calc-surface px-2 py-1 tabular-nums">
      <Calculator size={12} aria-hidden="true" className="text-foreground-muted" />
      {strong ? <strong>{value}</strong> : value}
      <span className="sr-only"> (calculado)</span>
    </span>
  );
}

export function BreakfastFillTable({ rows, values, baseDays, unitPrice, companyListId, previewTotal, onPatch, onCompanyText }: Props) {
  const visible = rows.filter((row) => values[row.id]);
  const quantityInput = (row: BreakfastFillRow, key: "discount" | "extra", label: string) => {
    const value = values[row.id];
    return <TextInput type="number" inputMode="numeric" min={0} step={1} aria-label={`${label} de ${row.employee?.officialName ?? ""}`} className="w-20 text-right tabular-nums" value={value[key]} onChange={(event) => onPatch(row.id, { [key]: event.target.value })} />;
  };
  const columns: DataTableColumn<BreakfastFillRow>[] = [
    { id: "employee", header: "Colaborador", rowHeader: true, sticky: "start", width: "13rem", cell: (row) => (
      <span className="grid min-w-0">
        <span className="truncate">{row.employee?.officialName}</span>
        <span className="truncate text-caption font-normal text-foreground-muted">{row.employee?.department || "—"} · {row.employee?.costCenter || "Sem CC"}</span>
      </span>
    ) },
    { id: "company", header: "Empresa", width: "12rem", cell: (row) => {
      const value = values[row.id]; const unmatched = Boolean(value.companyText.trim() && !value.companyId); const hintId = `cafe-company-${row.id}`;
      return (
        <span className="grid gap-0.5">
          <input list={companyListId} aria-label={`Empresa de ${row.employee?.officialName}`} aria-invalid={unmatched || !value.companyId || undefined} aria-describedby={unmatched ? hintId : undefined} className={textInputClassName} value={value.companyText} placeholder="Digite para buscar" onChange={(event) => onCompanyText(row.id, event.target.value)} />
          {unmatched ? <span id={hintId}><Note tone="warning">Selecione uma empresa cadastrada.</Note></span> : !value.companyId && <Note tone="warning">Empresa obrigatória</Note>}
        </span>
      );
    } },
    { id: "base", header: "Quantidade", numeric: true, cell: () => <CalculatedQuantity value={baseDays} /> },
    { id: "discount", header: "Desconto", numeric: true, cell: (row) => quantityInput(row, "discount", "Desconto") },
    // Quantidade extras: editável; o Espelho de Ponto só ATRIBUI o valor ao clicar em "Aplicar Quantidades Extras".
    { id: "extra", header: "Extras", numeric: true, cell: (row) => quantityInput(row, "extra", "Quantidade extras") },
    { id: "final", header: "Quantidade Final", numeric: true, cell: (row) => {
      const value = values[row.id];
      return (
        <span className="inline-grid justify-items-end gap-0.5">
          {row.error ? <span className="text-foreground-muted">—</span> : <CalculatedQuantity value={row.finalQuantity} strong />}
          <Note>{baseDays} − {value.discount || 0} + {value.extra || 0}</Note>
        </span>
      );
    } },
    { id: "total", header: "Total", numeric: true, className: "min-w-[8.5rem]", cell: (row) => (row.error
      ? <Note tone="danger" className="justify-end text-right">{row.error}</Note>
      : <span className="inline-grid justify-items-end gap-0.5"><strong className="text-card-title">{moneyCents(row.total)}</strong>{unitPrice && <Note>{row.finalQuantity} × {money(unitPrice)}</Note>}</span>) },
    { id: "observation", header: "Observação", width: "14rem", cell: (row) => {
      const value = values[row.id]; const name = row.employee?.officialName ?? "";
      return (
        <span className="grid gap-1">
          <span className="flex gap-1">
            <select aria-label={`Tipo de observação de ${name}`} className={`${textInputClassName} w-28 shrink-0`} value={value.obsType} onChange={(event) => onPatch(row.id, { obsType: event.target.value as BreakfastEntryValue["obsType"] })}><option value="">—</option><option value="RETROACTIVE">Retroativo</option><option value="OTHER">Outros</option></select>
            {value.obsType && <TextInput aria-label={`Detalhes da observação de ${name}`} placeholder={value.obsType === "RETROACTIVE" ? "2 cafés referentes ao mês anterior" : "Detalhes"} value={value.obsDetails} onChange={(event) => onPatch(row.id, { obsDetails: event.target.value })} />}
          </span>
          {value.obsType && value.obsDetails.trim() && <Note>{formatBreakfastObservation(value.obsType, value.obsDetails)}</Note>}
        </span>
      );
    } },
  ];
  return (
    <DataTable
      caption="Colaboradores da competência"
      columns={columns}
      rows={visible}
      getRowId={(row) => row.id}
      minWidth="1080px"
      footer={<p className="text-body tabular-nums">Prévia do Total Geral: <strong className="text-primary">{moneyCents(previewTotal)}</strong> · {people(visible.length)} · Quantidade Final = Quantidade − Desconto + Extras · o servidor recalcula tudo ao salvar.</p>}
    />
  );
}
