"use client";

// Lançamento manual PA — colaboradores selecionados com Refeições, Emissão NF e Subtotal. SÓ APRESENTAÇÃO: a página guarda
// quantidades/NF e calcula o subtotal da prévia; a empresa exibida vem do helper único da regra (FOOD_PA_INVOICES: NF 01 →
// BOINGA, NF 02 → PROJETA) apenas como leitura — o servidor deriva e grava a empresa a partir da NF.
import { DataTable, TextInput, textInputClassName, type DataTableColumn } from "@/components/ui";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { Note } from "@/modules/accounts-payable/shared/ui/parts";
import { FOOD_PA_INVOICE_CODES, FOOD_PA_INVOICES, isFoodPaInvoiceCode, type FoodPaInvoiceCode } from "../invoice-company";
import { money } from "./format";

export type FoodPaManualRow = { id: string; employee: CollaboratorOption | undefined; quantity: string; invoice: FoodPaInvoiceCode | ""; subtotal: number };

export function FoodPaManualTable({ rows, onQuantity, onInvoice }: { rows: FoodPaManualRow[]; onQuantity: (id: string, value: string) => void; onInvoice: (id: string, value: string) => void }) {
  const columns: DataTableColumn<FoodPaManualRow>[] = [
    { id: "employee", header: "Colaborador", rowHeader: true, sticky: "start", width: "15rem", cell: (row) => (
      <span className="grid min-w-0"><span className="truncate">{row.employee?.officialName}</span><span className="truncate text-caption font-normal text-foreground-muted">{row.employee?.department}</span></span>
    ) },
    { id: "quantity", header: "Refeições", numeric: true, cell: (row) => (
      <span className="inline-grid justify-items-end gap-0.5">
        <TextInput required type="number" min="1" step="1" inputMode="numeric" className="w-24 text-right tabular-nums" placeholder="Qtd." value={row.quantity} onChange={(event) => onQuantity(row.id, event.target.value)} aria-label={`Quantidade de refeições de ${row.employee?.officialName ?? "colaborador"}`} />
        {row.quantity !== "" && !Number.isInteger(Number(row.quantity)) && <Note tone="danger">Informe um inteiro.</Note>}
      </span>
    ) },
    { id: "invoice", header: "Emissão NF", cell: (row) => (
      <span className="grid gap-0.5">
        <select required className={textInputClassName} value={row.invoice} aria-invalid={(Number(row.quantity) > 0 && !isFoodPaInvoiceCode(row.invoice)) || undefined} onChange={(event) => onInvoice(row.id, event.target.value)} aria-label={`Emissão NF de ${row.employee?.officialName ?? "colaborador"}`}>
          <option value="">Selecione...</option>
          {FOOD_PA_INVOICE_CODES.map((code) => <option key={code} value={code}>{FOOD_PA_INVOICES[code].label}</option>)}
        </select>
        {Number(row.quantity) > 0 && !isFoodPaInvoiceCode(row.invoice) && <Note tone="warning">NF obrigatória</Note>}
      </span>
    ) },
    { id: "company", header: "Empresa no rateio", cell: (row) => (isFoodPaInvoiceCode(row.invoice) ? FOOD_PA_INVOICES[row.invoice].company : <span className="text-foreground-muted">—</span>) },
    { id: "subtotal", header: "Subtotal", numeric: true, cell: (row) => <strong>{money(row.subtotal)}</strong> },
  ];
  return <DataTable caption="Colaboradores do lançamento PA" columns={columns} rows={rows} getRowId={(row) => row.id} density="dense" minWidth="760px" />;
}
