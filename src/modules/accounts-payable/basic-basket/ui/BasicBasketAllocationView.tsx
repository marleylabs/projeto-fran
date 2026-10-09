"use client";

// Aba "Rateio" da Cesta Básica: Empresa → Departamento → Colaborador, por lançamento (mapa). SÓ APRESENTAÇÃO:
// o agrupamento e as somas vêm de groupBasicBasketByCompanyDepartment (rateio.ts), a partir dos snapshots salvos.
// Implementação visual própria da Cesta (Café e VT usam as perspectivas compartilhadas de AllocationViews).
// Fase 7E.1: "Visualizar por" — Departamento, Centro de Custo, Empresa/Departamento (padrão) e Empresa/CC/Departamento,
// todas sobre a MESMA base (Total salvo de cada alocação + snapshots), via AllocationViews compartilhado.
import { useState } from "react";
import { Download, FileSpreadsheet, PencilLine, XCircle } from "lucide-react";
import clsx from "clsx";
import { AllocationViews } from "@/components/allocation/AllocationViews";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { normalizeAllocationRow, type AllocationViewId } from "@/modules/accounts-payable/shared/allocation-views";
import { Button, Card, CardHeader, DataTable, EmptyState, StatusBadge, buttonClassName, type DataTableColumn } from "@/components/ui";
import { formatDateOnlyBR } from "@/lib/date-only";
import { groupBasicBasketByCompanyDepartment } from "../rateio";
import { adjustmentNote, money, moneyCents } from "./format";
import { CompetenceSummary } from "@/modules/accounts-payable/shared/ui/CompetenceSummary";
import { InfoTip, Note } from "@/modules/accounts-payable/shared/ui/parts";
import type { BasicBasketAllocationRow, BasicBasketMapData } from "./types";

type ViewProps = { monthLabel: string; onCorrect: (map: BasicBasketMapData, row: BasicBasketAllocationRow) => void; onCancel: (mapId: string) => void; onFlash: (mapId: string) => void; flashBusy: string | null };

export function BasicBasketAllocationView({ maps, ...props }: ViewProps & { maps: BasicBasketMapData[] }) {
  if (!maps.length) return <Card><EmptyState title="Nenhum lançamento nesta competência." description="Preencha as etapas para gerar o rateio." /></Card>;
  return (
    <div className="grid gap-4">
      {maps.map((map) => <MapAllocation key={map.id} map={map} {...props} />)}
    </div>
  );
}

function MapAllocation({ map, monthLabel, onCorrect, onCancel, onFlash, flashBusy }: ViewProps & { map: BasicBasketMapData }) {
  const [view, setView] = useState<AllocationViewId>("companyDepartment");
  const tree = groupBasicBasketByCompanyDepartment(map.allocations);
  const viewRows = map.allocations.map((row) => normalizeAllocationRow({ id: row.id, companyId: row.companyId, company: row.company, costCenter: row.costCenter, department: row.department, employeeId: row.employeeId, employeeName: row.employeeName, cents: amountToCents(row.amount), source: row }));
  const diff = tree.totals.totalCents - Math.round(Number(map.totalAmount) * 100);
  const inconsistent = diff !== 0 || !tree.consistent;
  const columns: DataTableColumn<BasicBasketAllocationRow>[] = [
    { id: "name", header: "Colaborador", rowHeader: true, width: "14rem", cell: (row) => <span className="block truncate">{row.employeeName}</span> },
    { id: "bonus", header: "Bonificação", numeric: true, cell: (row) => money(row.driverBonus) },
    { id: "agreement", header: "Acordo", numeric: true, cell: (row) => money(row.agreementAmount) },
    { id: "basket", header: "Cesta", numeric: true, cell: (row) => {
      const note = adjustmentNote(row.currentUnjustifiedAbsence, row.currentVacationDays, row.currentPayableDays, "Cortada — Falta Injustificada (mês de apuração)");
      return (
        <span className="inline-grid justify-items-end">
          <span className="inline-flex items-center gap-1">{money(row.basketAmount)}<InfoTip label={`Detalhe da Cesta de ${row.employeeName}`} content={row.currentUnjustifiedAbsence ? "Cesta cortada devido à Falta Injustificada no mês de apuração (mês anterior à competência)." : `Valor mensal ${money(row.monthlyBasketAmount)} · ${row.currentBasketDays} de ${row.currentCalculationDays} dias de direito`} /></span>
          {note ? <Note tone={row.currentUnjustifiedAbsence ? "danger" : "muted"}>{note}</Note> : row.currentBasketDays !== row.currentCalculationDays && <Note>{row.currentBasketDays} de {row.currentCalculationDays} dias · mensal {money(row.monthlyBasketAmount)}</Note>}
        </span>
      );
    } },
    { id: "retroactive", header: "Retroativo", numeric: true, cell: (row) => {
      const note = adjustmentNote(row.retroactiveUnjustifiedAbsence, row.retroactiveVacationDays, row.retroactivePayableDays);
      return (
        <span className="inline-grid justify-items-end">
          <span className="inline-flex items-center gap-1">{money(row.retroactiveAmount)}<InfoTip label={`Detalhe do Retroativo de ${row.employeeName}`} content={row.retroactiveDays ? `Admissão ${formatDateOnlyBR(row.admissionDate)} · pagamento anterior ${formatDateOnlyBR(map.previousPaymentDate)} · ${row.retroactiveDays} de ${row.referenceCalculationDays} dias do mês anterior` : row.admissionDate ? "Sem retroativo" : "Data de Admissão não cadastrada"} /></span>
          {note ? <Note tone={row.retroactiveUnjustifiedAbsence ? "danger" : "muted"}>{note}</Note> : row.retroactiveDays > 0 && <Note>{row.retroactiveDays} de {row.referenceCalculationDays} dias</Note>}
        </span>
      );
    } },
    { id: "total", header: "Total", numeric: true, cell: (row) => <strong>{money(row.amount)}</strong> },
    { id: "observation", header: "Observação", wrap: true, className: "min-w-[12rem] text-foreground-muted", cell: (row) => row.observation || "—" },
  ];

  return (
    <Card padding="none" as="article" className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5">
        <CardHeader title={map.administrativeEntity.tradeName} description={`Competência ${monthLabel} · versão ${map.version}`} actions={<StatusBadge tone="success">Concluído</StatusBadge>} />
        <CompetenceSummary
          className="xl:grid-cols-4"
          items={[
            { label: "Empresas / departamentos", value: `${tree.companies.length} / ${tree.companies.reduce((sum, company) => sum + company.departments.length, 0)}` },
            { label: "Colaboradores", value: tree.totals.people },
            { label: "Pagamento · dias no mês", value: `${formatDateOnlyBR(map.paymentDate)} · ${map.daysInMonth}` },
            { label: "Valor total · obrigação", value: money(map.totalAmount), helper: map.financialRecord?.identifier, emphasis: true },
          ]}
        />
        <AllocationViews
          rows={viewRows}
          value={view}
          onValueChange={setView}
          expectedCents={amountToCents(map.totalAmount)}
          renderLeaf={(rows, node) => (
            <DataTable
              caption={`${map.administrativeEntity.tradeName} — ${node.label}`}
              columns={columns}
              rows={rows.map((row) => row.source)}
              getRowId={(row) => row.id}
              density="dense"
              minWidth="900px"
              rowActions={(row) => <Button size="sm" variant="ghost" onClick={() => onCorrect(map, row)} aria-label={`Corrigir lançamento de ${row.employeeName}`}><PencilLine size={14} aria-hidden="true" />Corrigir</Button>}
            />
          )}
        />
        <dl role={diff !== 0 ? "alert" : undefined} className={clsx("flex flex-wrap gap-x-6 gap-y-1 rounded-control border px-3 py-2 text-body tabular-nums", inconsistent ? "border-danger/40 bg-danger-soft text-danger-text" : "border-border bg-surface-muted")}>
          {inconsistent && <XCircle size={16} aria-hidden="true" className="self-center" />}
          {([["Valor total", money(map.totalAmount)], ["Rateado", moneyCents(tree.totals.totalCents)], ["Obrigação", map.financialRecord ? money(map.financialRecord.grossAmount) : "—"], ["Diferença", moneyCents(diff)]] as const).map(([label, value]) => (
            <div key={label} className="flex gap-1.5"><dt className="text-foreground-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
        <a href={`/api/accounts-payable/basic-basket/${map.id}/download`} className={buttonClassName({ variant: "secondary", size: "sm" })}><Download size={14} aria-hidden="true" />Download do rateio XLSX</a>
        <Button size="sm" variant="secondary" loading={flashBusy === map.id} disabled={flashBusy !== null} onClick={() => onFlash(map.id)}><FileSpreadsheet size={14} aria-hidden="true" />Máscara Flash</Button>
        <Button size="sm" variant="error" className="ml-auto" onClick={() => onCancel(map.id)}>Cancelar lançamento</Button>
      </div>
    </Card>
  );
}
