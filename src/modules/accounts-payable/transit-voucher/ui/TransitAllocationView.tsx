"use client";

// Aba "Rateio" do Vale Transporte, por lançamento (mapa). SÓ APRESENTAÇÃO: as perspectivas vêm do AllocationViews
// compartilhado, todas sobre a MESMA base (valor salvo de cada alocação + snapshots de empresa, departamento e centro de
// custo gravados no lançamento — nunca o cadastro atual). Padrão = Empresa → Departamento (a visão que já existia).
// Nenhuma perspectiva recalcula passagem ou valor; Corrigir/Excluir só chamam os callbacks da página.
import { useState } from "react";
import { Download, PencilLine, Trash2, XCircle } from "lucide-react";
import clsx from "clsx";
import { AllocationViews } from "@/components/allocation/AllocationViews";
import { Button, Card, CardHeader, DataTable, EmptyState, StatusBadge, buttonClassName, type DataTableColumn } from "@/components/ui";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { normalizeAllocationRow, type AllocationViewId } from "@/modules/accounts-payable/shared/allocation-views";
import { CompetenceSummary } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import { formatTransitObservation } from "../calculations";
import { money, moneyCents } from "./format";
import type { TransitAllocationRow, TransitBase, TransitMapData } from "./types";

// Legenda da tabela final com o caminho completo do grupo (evita legendas repetidas entre empresas).
const leafPath = (view: AllocationViewId, row: { company: string; costCenter: string; department: string } | undefined) => !row ? "" : (view === "department" ? [row.department] : view === "costCenter" ? [row.costCenter] : view === "companyDepartment" ? [row.company, row.department] : [row.company, row.costCenter, row.department]).join(" / ");

type ViewProps = { monthLabel: string; baseOf: (map: TransitMapData) => TransitBase; onCorrect: (mapId: string, row: TransitAllocationRow) => void; onDeleteRecord: (mapId: string, rowId: string) => void; onCancel: (mapId: string) => void };

export function TransitAllocationView({ maps, ...props }: ViewProps & { maps: TransitMapData[] }) {
  if (!maps.length) return <Card><EmptyState title="Nenhum lançamento nesta competência." description="Preencha o Preenchimento para gerar o rateio." /></Card>;
  return <div className="grid gap-4">{maps.map((map) => <MapAllocation key={map.id} map={map} {...props} />)}</div>;
}

function MapAllocation({ map, monthLabel, baseOf, onCorrect, onDeleteRecord, onCancel }: ViewProps & { map: TransitMapData }) {
  const [view, setView] = useState<AllocationViewId>("companyDepartment");
  const rows = map.allocations;
  const viewRows = rows.map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: amountToCents(row.amount), source: row }));
  const rateadoCents = viewRows.reduce((sum, row) => sum + row.cents, 0);
  const diff = rateadoCents - amountToCents(map.totalAmount);
  const companies = new Set(rows.map((row) => row.company)).size;
  const departments = new Set(rows.map((row) => `${row.company}|${row.department ?? "Não informado"}`)).size;
  const base = baseOf(map);
  const columns: DataTableColumn<TransitAllocationRow>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "14rem", cell: (row) => <span className="block truncate">{row.employeeName}</span> },
    { id: "daily", header: "Passagens/dia", numeric: true, cell: (row) => row.dailyPassageQuantity ?? "—" },
    { id: "passages", header: "A receber", numeric: true, cell: (row) => row.passagesToReceive ?? "—" },
    { id: "amount", header: "Valor", numeric: true, cell: (row) => <strong>{money(row.amount)}</strong> },
    { id: "observation", header: "Observação", wrap: true, className: "min-w-[12rem] text-foreground-muted", cell: (row) => formatTransitObservation(row.observationType, row.observationDetails) || "—" },
  ];
  return (
    <Card padding="none" as="article" className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5">
        <CardHeader title={map.administrativeEntity.tradeName} description={`Competência ${monthLabel} · versão ${map.version}`} actions={<StatusBadge tone="success">Concluído</StatusBadge>} />
        <CompetenceSummary
          className="xl:grid-cols-4"
          items={[
            { label: "Empresas / departamentos", value: `${companies} / ${departments}` },
            { label: "Colaboradores", value: new Set(rows.map((row) => row.employeeId ?? row.employeeName)).size },
            { label: "Dias úteis · passagem", value: `${base.workingDays ?? "—"} · ${base.fareUnitPrice ? money(base.fareUnitPrice) : "—"}` },
            { label: "Valor total · obrigação", value: money(map.totalAmount), helper: map.financialRecord?.identifier, emphasis: true },
          ]}
        />
        <AllocationViews
          rows={viewRows}
          value={view}
          onValueChange={setView}
          expectedCents={amountToCents(map.totalAmount)}
          renderLeaf={(leafRows, node) => (
            <DataTable
              caption={`${map.administrativeEntity.tradeName} — ${leafPath(view, leafRows[0]) || node.label}`}
              columns={columns}
              rows={leafRows.map((row) => row.source).sort((a, b) => comparePtBr(a.employeeName, b.employeeName))}
              getRowId={(row) => row.id}
              density="dense"
              minWidth="720px"
              rowActions={(row) => (
                <span className="inline-flex gap-1">
                  {row.passagesToReceive !== null && <Button size="sm" variant="ghost" onClick={() => onCorrect(map.id, row)} aria-label={`Corrigir lançamento de ${row.employeeName}`}><PencilLine size={14} aria-hidden="true" />Corrigir</Button>}
                  <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => onDeleteRecord(map.id, row.id)} aria-label={`Excluir registro de ${row.employeeName}`}><Trash2 size={14} aria-hidden="true" />Excluir</Button>
                </span>
              )}
            />
          )}
        />
        <dl role={diff !== 0 ? "alert" : undefined} className={clsx("flex flex-wrap gap-x-6 gap-y-1 rounded-control border px-3 py-2 text-body tabular-nums", diff !== 0 ? "border-danger/40 bg-danger-soft text-danger-text" : "border-border bg-surface-muted")}>
          {diff !== 0 && <XCircle size={16} aria-hidden="true" className="self-center" />}
          {([["Valor total", money(map.totalAmount)], ["Rateado", moneyCents(rateadoCents)], ["Obrigação", map.financialRecord?.grossAmount ? money(map.financialRecord.grossAmount) : "—"], ["Diferença", moneyCents(diff)]] as const).map(([label, value]) => (
            <div key={label} className="flex gap-1.5"><dt className="text-foreground-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
        <a href={`/api/accounts-payable/transit-voucher/${map.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}><Download size={14} aria-hidden="true" />Download do rateio XLSX</a>
        <Button size="sm" variant="error" className="ml-auto" onClick={() => onCancel(map.id)}>Cancelar lançamento</Button>
      </div>
    </Card>
  );
}
