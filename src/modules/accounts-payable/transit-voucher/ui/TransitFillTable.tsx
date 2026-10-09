"use client";

// Tabela de preenchimento do Vale Transporte. SÓ APRESENTAÇÃO: Passagens a Receber e Valor Total chegam prontos da
// prévia da página (calculatePassagesToReceive / calculateTransitVoucherEmployeeTotal); aqui só se exibe a leitura da
// linha (dias úteis + diferença − descontos = a receber; tarifa × passagem/dia × a receber = total) e se repassa a
// digitação por callback. O servidor recalcula tudo ao salvar.
import type { ReactNode } from "react";
import { Calculator } from "lucide-react";
import { DataTable, TextInput, textInputClassName, type DataTableColumn } from "@/components/ui";
import type { CollaboratorOption } from "@/components/CollaboratorCombobox";
import { Note } from "@/modules/accounts-payable/shared/ui/parts";
import { formatTransitObservation } from "../calculations";
import { money, moneyCents, people } from "./format";
import type { TransitEntryValue } from "./types";

export type TransitFillRow = { id: string; employee: CollaboratorOption | undefined; error: string | null; passages: number; total: number };

type Props = {
  rows: TransitFillRow[];
  values: Record<string, TransitEntryValue>;
  baseDays: number;
  fare: string | undefined;
  companyListId: string;
  previewTotal: number;
  onPatch: (id: string, patch: Partial<TransitEntryValue>) => void;
  onCompanyText: (id: string, text: string) => void;
};

// Valor calculado: superfície de valor calculado (não parece campo editável).
function Calculated({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-11 items-center justify-end gap-1 rounded-control bg-calc-surface px-2 py-1 tabular-nums">
      <Calculator size={12} aria-hidden="true" className="text-foreground-muted" />
      <strong>{children}</strong>
      <span className="sr-only"> (calculado)</span>
    </span>
  );
}

export function TransitFillTable({ rows, values, baseDays, fare, companyListId, previewTotal, onPatch, onCompanyText }: Props) {
  const visible = rows.filter((row) => values[row.id]);
  // Inteiros informados pelo usuário (sem CurrencyInput); a validação continua na prévia da página e no servidor.
  const quantityInput = (row: TransitFillRow, key: "qty" | "diff" | "discount", label: string, min?: number) => (
    <TextInput type="number" inputMode="numeric" min={min} step={1} aria-label={`${label} de ${row.employee?.officialName ?? ""}`} className="w-20 text-right tabular-nums" value={values[row.id][key]} onChange={(event) => onPatch(row.id, { [key]: event.target.value })} />
  );
  const columns: DataTableColumn<TransitFillRow>[] = [
    { id: "employee", header: "Colaborador", rowHeader: true, sticky: "start", width: "12rem", cell: (row) => (
      <span className="grid min-w-0">
        <span className="truncate">{row.employee?.officialName}</span>
        <span className="truncate text-caption font-normal text-foreground-muted">{row.employee?.department || "—"} · {row.employee?.costCenter || "Sem CC"}</span>
      </span>
    ) },
    { id: "company", header: "Empresa", width: "11rem", cell: (row) => {
      const value = values[row.id]; const unmatched = Boolean(value.companyText.trim() && !value.companyId); const hintId = `vt-company-${row.id}`;
      return (
        <span className="grid gap-0.5">
          <input list={companyListId} aria-label={`Empresa de ${row.employee?.officialName}`} aria-invalid={unmatched || !value.companyId || undefined} aria-describedby={unmatched ? hintId : undefined} className={textInputClassName} value={value.companyText} placeholder="Digite para buscar" onChange={(event) => onCompanyText(row.id, event.target.value)} />
          {unmatched ? <span id={hintId}><Note tone="warning">Selecione uma empresa cadastrada.</Note></span> : !value.companyId && <Note tone="warning">Empresa obrigatória</Note>}
        </span>
      );
    } },
    { id: "qty", header: "Passagem por Dia", numeric: true, headerClassName: "whitespace-normal! leading-tight", cell: (row) => quantityInput(row, "qty", "Passagem por dia", 1) },
    { id: "diff", header: "Diferença Mês Anterior", numeric: true, headerClassName: "whitespace-normal! leading-tight", cell: (row) => quantityInput(row, "diff", "Diferença mês anterior") },
    { id: "discount", header: "Descontos Passagens", numeric: true, headerClassName: "whitespace-normal! leading-tight", cell: (row) => quantityInput(row, "discount", "Descontos", 0) },
    { id: "passages", header: "Passagens a Receber", numeric: true, headerClassName: "whitespace-normal! leading-tight", cell: (row) => {
      const value = values[row.id];
      return (
        <span className="inline-grid justify-items-end gap-0.5">
          {row.error ? <span className="text-foreground-muted">—</span> : <Calculated>{row.passages}</Calculated>}
          <Note>{baseDays} + {value.diff || 0} − {value.discount || 0}</Note>
        </span>
      );
    } },
    { id: "total", header: "Valor Total", numeric: true, className: "min-w-[8.5rem]", cell: (row) => (row.error
      ? <Note tone="danger" className="justify-end text-right">{row.error}</Note>
      : <span className="inline-grid justify-items-end gap-0.5"><strong className="text-card-title">{moneyCents(row.total)}</strong>{fare && <Note>{money(fare)} × {values[row.id].qty} × {row.passages}</Note>}</span>) },
    { id: "observation", header: "Observação", width: "13rem", cell: (row) => {
      const value = values[row.id]; const name = row.employee?.officialName ?? "";
      return (
        <span className="grid gap-1">
          <span className="flex gap-1">
            <select aria-label={`Tipo de observação de ${name}`} className={`${textInputClassName} w-28 shrink-0`} value={value.obsType} onChange={(event) => onPatch(row.id, { obsType: event.target.value as TransitEntryValue["obsType"] })}><option value="">—</option><option value="VACATION">Férias</option><option value="OTHER">Outros</option></select>
            {value.obsType && <TextInput aria-label={`Detalhes da observação de ${name}`} placeholder={value.obsType === "VACATION" ? "24/08 a 22/09" : "Detalhes"} value={value.obsDetails} onChange={(event) => onPatch(row.id, { obsDetails: event.target.value })} />}
          </span>
          {value.obsType && value.obsDetails.trim() && <Note>{formatTransitObservation(value.obsType, value.obsDetails)}</Note>}
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
      footer={<p className="text-body tabular-nums">Prévia do Total Geral: <strong className="text-primary">{moneyCents(previewTotal)}</strong> · {people(visible.length)} · Passagens a Receber = dias úteis + diferença − descontos; Valor Total = tarifa × passagem por dia × passagens a receber · o servidor recalcula tudo ao salvar.</p>}
    />
  );
}
