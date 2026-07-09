import ExcelJS from "exceljs";
import type { ExtractionResult } from "@/lib/types/payroll";
import { SINTETICO_HEADERS } from "./sinteticoRows";
import { unifiedRowFromColaborador, unifiedRowToArray } from "./unifiedRow";
import { triggerDownload } from "./download";

// Formato "Contábil" (padrão do Excel/pt-BR) para as colunas monetárias.
const ACCOUNTING_FORMAT = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
// Colunas monetárias: da SALARIO até LIQUIDO (índice 1-based, MAT=1, NOME=2, CH=3).
const ACCOUNTING_COLUMNS_RANGE = [4, 18] as const;
const MAT_COLUMN = 1;

export async function exportExcel(result: ExtractionResult, filename = "extrato-mensal.xlsx") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Extrato Mensal - Extrator de Folha";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Colaboradores");
  sheet.columns = SINTETICO_HEADERS.map(() => ({ width: 16 }));

  const rows = result.colaboradores.map((c) => unifiedRowToArray(unifiedRowFromColaborador(c)));

  sheet.addTable({
    name: "Colaboradores",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: SINTETICO_HEADERS.map((name) => ({ name, filterButton: true })),
    rows,
  });

  // MAT no padrão "000025" e colunas de valores no formato Contábil.
  sheet.getColumn(MAT_COLUMN).numFmt = "000000";
  for (let col = ACCOUNTING_COLUMNS_RANGE[0]; col <= ACCOUNTING_COLUMNS_RANGE[1]; col++) {
    sheet.getColumn(col).numFmt = ACCOUNTING_FORMAT;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, filename);
}
