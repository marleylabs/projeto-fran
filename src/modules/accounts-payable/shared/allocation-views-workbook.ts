// Abas XLSX das perspectivas de rateio (mesma base normalizada da tela) + base analítica "Detalhado - Colaborador".
// Fase 7I.1: as quatro perspectivas são VISÕES HIERÁRQUICAS (aparência de Tabela Dinâmica, sem PivotCache): coluna de
// rótulos com indentação por nível (alignment.indent, nunca espaços no texto) + Valor numérico; a linha de cada grupo
// (Empresa / Centro de Custo / Departamento) traz o subtotal do grupo e fica ACIMA dos filhos; os níveis viram
// outlineLevel do Excel (agrupar/expandir), abertos por padrão. "Total Geral" fecha a aba.
// A aba detalhada é uma BASE: uma linha por alocação, cabeçalho único, AutoFilter, sem subtotais nem células mescladas.
// Colunas comuns (Colaborador, Empresa, Centro de Custo, Departamento, Competência, Valor) vêm daqui; as específicas
// (Férias, NF, Passagens, Extras…) pertencem ao adapter de cada módulo.
// Validação defensiva: Σ Detalhado = V1 = V2 = V3 = V4 = total da fonte; qualquer divergência FALHA a geração.
// Nomes das abas (limite de 31 caracteres do Excel): "Rateio - Departamento", "Rateio - Centro de Custo",
// "Rateio - Empresa Departamento", "Rateio - Empresa CC Depto" e "Detalhado - Colaborador".
import type ExcelJS from "exceljs";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { ALLOCATION_LEVEL_LABEL, ALLOCATION_VIEWS, assertAllocationViews, buildAllocationViews, type AllocationNode, type AllocationViewId, type AllocationViewRow } from "./allocation-views";

export const ALLOCATION_VIEW_SHEET_NAMES: Record<AllocationViewId, string> = {
  department: "Rateio - Departamento",
  costCenter: "Rateio - Centro de Custo",
  companyDepartment: "Rateio - Empresa Departamento",
  companyCostCenterDepartment: "Rateio - Empresa CC Depto",
};
export const ALLOCATION_DETAIL_SHEET_NAME = "Detalhado - Colaborador";

export type AllocationSheetStyle = { header: (row: ExcelJS.Row) => void; total: (row: ExcelJS.Row) => void; moneyFormat: string };
/** Coluna específica do módulo na aba detalhada: lê só a alocação persistida (row.source), nunca recalcula. */
export type AllocationDetailColumn<T> = { header: string; width?: number; numFmt?: string; wrap?: boolean; value: (row: AllocationViewRow<T>) => ExcelJS.CellValue };
export type AllocationDetailOptions<T> = { competence: string; columns?: readonly AllocationDetailColumn<T>[] };

const GROUP_FILL = "FFF2F2F2";
const GROUP_BORDER = "FFBFBFBF";
const cell = (value: ExcelJS.CellValue | undefined) => (value === undefined || value === "" ? null : value);

export function addAllocationViewSheets<T>(workbook: ExcelJS.Workbook, rows: readonly AllocationViewRow<T>[], options: { expectedCents: number; context: string; style: AllocationSheetStyle; views?: readonly AllocationViewId[]; detail: AllocationDetailOptions<T> }) {
  const views = buildAllocationViews(rows, options.views);
  assertAllocationViews(views, options.expectedCents, options.context);
  for (const definition of ALLOCATION_VIEWS) {
    const tree = views[definition.id];
    if (!tree) continue;
    const levels = definition.levels;
    const sheet = workbook.addWorksheet(ALLOCATION_VIEW_SHEET_NAMES[definition.id], { properties: { outlineProperties: { summaryBelow: false, summaryRight: false } } });
    options.style.header(sheet.addRow([[...levels.map((level) => ALLOCATION_LEVEL_LABEL[level]), "Colaborador"].join(" / "), "Valor"]));
    let collaboratorCents = 0;
    const line = (label: string, cents: number, depth: number, group: boolean) => {
      const row = sheet.addRow([label, cents / 100]);
      row.outlineLevel = depth;
      row.getCell(1).alignment = { indent: depth * 2, vertical: "middle" };
      row.getCell(2).numFmt = options.style.moneyFormat;
      if (group) {
        row.font = { bold: true };
        if (depth === 0) for (const column of [1, 2]) { const target = row.getCell(column); target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_FILL } }; target.border = { top: { style: "thin", color: { argb: GROUP_BORDER } } }; }
      }
    };
    const write = (node: AllocationNode<T>, depth: number) => {
      line(node.label, node.cents, depth, true);
      if (node.children.length) for (const child of node.children) write(child, depth + 1);
      // Folha: uma linha por ALOCAÇÃO (id/snapshot), nunca consolidada por nome.
      else for (const row of node.rows) { line(row.employeeName, row.cents, depth + 1, false); collaboratorCents += row.cents; }
    };
    for (const node of tree.nodes) write(node, 0);
    if (collaboratorCents !== options.expectedCents) throw new Error(`Inconsistência no rateio de ${options.context} (${definition.label}): colaboradores ${(collaboratorCents / 100).toFixed(2)} ≠ ${(options.expectedCents / 100).toFixed(2)}.`);
    const total = sheet.addRow(["Total Geral", tree.totalCents / 100]);
    options.style.total(total); total.getCell(2).numFmt = options.style.moneyFormat;
    sheet.columns = [{ width: 60 }, { width: 18 }];
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  addAllocationDetailSheet(workbook, rows, options);
  return views;
}

function addAllocationDetailSheet<T>(workbook: ExcelJS.Workbook, rows: readonly AllocationViewRow<T>[], options: { expectedCents: number; context: string; style: AllocationSheetStyle; detail: AllocationDetailOptions<T> }) {
  const columns: AllocationDetailColumn<T>[] = [
    { header: "Colaborador", width: 36, wrap: true, value: (row) => row.employeeName },
    { header: "Empresa", width: 22, wrap: true, value: (row) => row.company },
    { header: "Centro de Custo", width: 28, wrap: true, value: (row) => row.costCenter },
    { header: "Departamento", width: 26, wrap: true, value: (row) => row.department },
    { header: "Competência", width: 13, value: () => options.detail.competence },
    ...(options.detail.columns ?? []),
    { header: "Valor", width: 16, numFmt: options.style.moneyFormat, value: (row) => row.cents / 100 },
  ];
  const sheet = workbook.addWorksheet(ALLOCATION_DETAIL_SHEET_NAME);
  options.style.header(sheet.addRow(columns.map((column) => column.header)));
  const ordered = [...rows].sort((a, b) => comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.company, b.company) || comparePtBr(a.costCenter, b.costCenter) || comparePtBr(a.department, b.department) || comparePtBr(a.id, b.id));
  let detailCents = 0;
  for (const row of ordered) {
    const line = sheet.addRow(columns.map((column) => cell(column.value(row))));
    columns.forEach((column, index) => {
      const target = line.getCell(index + 1);
      if (column.numFmt) target.numFmt = column.numFmt;
      target.alignment = { vertical: "top", ...(column.wrap ? { wrapText: true } : {}) };
    });
    detailCents += row.cents;
  }
  if (detailCents !== options.expectedCents) throw new Error(`Inconsistência no rateio de ${options.context} (Detalhado): ${(detailCents / 100).toFixed(2)} ≠ ${(options.expectedCents / 100).toFixed(2)}.`);
  // Largura mínima = cabeçalho + espaço do botão do AutoFilter (o cabeçalho nunca fica cortado).
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = Math.max(column.width ?? 16, column.header.length + 5); });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sheet.rowCount, 1), column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}
