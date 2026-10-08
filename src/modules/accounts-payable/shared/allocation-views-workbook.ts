// Abas XLSX das perspectivas de rateio (mesma base normalizada da tela). Cada aba traz colunas EXPLÍCITAS da hierarquia
// (Empresa / Centro de Custo / Departamento / Colaborador) em toda linha — não depende de indentação —, linhas de
// subtotal identificadas na coluna "Linha", valores numéricos e o Total Geral validado contra o lançamento:
// se a soma dos colaboradores ou de algum nível divergir, a geração FALHA (nunca exporta rateio divergente).
// Nomes das abas (limite de 31 caracteres do Excel): "Rateio - Departamento", "Rateio - Centro de Custo",
// "Rateio - Empresa Departamento" e "Rateio - Empresa CC Depto" (CC = Centro de Custo, Depto = Departamento).
import type ExcelJS from "exceljs";
import { ALLOCATION_LEVEL_LABEL, ALLOCATION_VIEWS, assertAllocationViews, buildAllocationViews, type AllocationNode, type AllocationViewId, type AllocationViewRow } from "./allocation-views";

export const ALLOCATION_VIEW_SHEET_NAMES: Record<AllocationViewId, string> = {
  department: "Rateio - Departamento",
  costCenter: "Rateio - Centro de Custo",
  companyDepartment: "Rateio - Empresa Departamento",
  companyCostCenterDepartment: "Rateio - Empresa CC Depto",
};

export type AllocationSheetStyle = { header: (row: ExcelJS.Row) => void; total: (row: ExcelJS.Row) => void; moneyFormat: string };

export function addAllocationViewSheets<T>(workbook: ExcelJS.Workbook, rows: readonly AllocationViewRow<T>[], options: { expectedCents: number; context: string; style: AllocationSheetStyle; views?: readonly AllocationViewId[] }) {
  const views = buildAllocationViews(rows, options.views);
  assertAllocationViews(views, options.expectedCents, options.context);
  for (const definition of ALLOCATION_VIEWS) {
    const tree = views[definition.id];
    if (!tree) continue;
    const levels = definition.levels;
    const sheet = workbook.addWorksheet(ALLOCATION_VIEW_SHEET_NAMES[definition.id]);
    const header = sheet.addRow([...levels.map((level) => ALLOCATION_LEVEL_LABEL[level]), "Colaborador", "Valor", "Linha"]);
    options.style.header(header);
    const valueColumn = levels.length + 2;
    let collaboratorCents = 0;
    const write = (node: AllocationNode<T>, path: string[]) => {
      const labels = [...path, node.label];
      if (node.children.length) for (const child of node.children) write(child, labels);
      else for (const row of node.rows) {
        sheet.addRow([...labels, row.employeeName, row.cents / 100, "Colaborador"]);
        collaboratorCents += row.cents;
      }
      // Subtotal do nível: colunas dos níveis acima e do próprio nível preenchidas; as de baixo ficam vazias.
      const subtotal = sheet.addRow([...labels, ...Array(levels.length - labels.length).fill(""), "", node.cents / 100, `Subtotal ${ALLOCATION_LEVEL_LABEL[node.level]}`]);
      subtotal.font = { bold: true };
    };
    for (const node of tree.nodes) write(node, []);
    if (collaboratorCents !== options.expectedCents) throw new Error(`Inconsistência no rateio de ${options.context} (${definition.label}): colaboradores ${(collaboratorCents / 100).toFixed(2)} ≠ ${(options.expectedCents / 100).toFixed(2)}.`);
    options.style.total(sheet.addRow(["Total Geral", ...Array(levels.length).fill(""), tree.totalCents / 100, "Total Geral"]));
    sheet.columns = [...levels.map(() => ({ width: 28 })), { width: 36 }, { width: 18 }, { width: 24 }];
    sheet.getColumn(valueColumn).numFmt = options.style.moneyFormat;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  return views;
}
