import ExcelJS from "exceljs";
import type { ExtractionResult } from "@/lib/types/payroll";
import { SINTETICO_HEADERS } from "./sinteticoRows";
import { unifiedRowFromColaborador, unifiedRowToArray } from "./unifiedRow";
import { triggerDownload } from "./download";

// Formato "Contábil" (padrão do Excel/pt-BR) para as colunas monetárias.
const ACCOUNTING_FORMAT = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';

export async function exportExcel(result: ExtractionResult, filename = "extrato-mensal.xlsx") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Extrato Mensal - Extrator de Folha";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Colaboradores");
  const includesEmpresa = result.colaboradores.some((c) => c.empresaNome);
  const headers = includesEmpresa ? ["EMPRESA", ...SINTETICO_HEADERS] : [...SINTETICO_HEADERS];
  sheet.columns = headers.map(() => ({ width: 16 }));

  const rows = result.colaboradores.map((c) => {
    const row = unifiedRowToArray(unifiedRowFromColaborador(c));
    return includesEmpresa ? [c.empresaNome || "", ...row] : row;
  });

  sheet.addTable({
    name: "Colaboradores",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows,
  });

  // MAT no padrão "000025" e colunas de valores no formato Contábil.
  const offset = includesEmpresa ? 1 : 0;
  sheet.getColumn(1 + offset).numFmt = "000000";
  for (let col = 4 + offset; col <= 18 + offset; col++) {
    sheet.getColumn(col).numFmt = ACCOUNTING_FORMAT;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, filename);
}
