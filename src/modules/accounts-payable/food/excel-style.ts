import ExcelJS from "exceljs";

export const FOOD_EXCEL_PRIMARY = "FFAF1B1B";
export const FOOD_EXCEL_BLACK = "FF000000";
export const FOOD_EXCEL_WHITE = "FFFFFFFF";
export const FOOD_EXCEL_MONEY_FORMAT = '"R$" #,##0.00';
export const FOOD_EXCEL_FONT = { name: "Calibri", size: 11 } as const;

function styleBand(row: ExcelJS.Row, color: string) {
  row.height = 18;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...FOOD_EXCEL_FONT, bold: true, color: { argb: FOOD_EXCEL_WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
}

export function styleFoodExcelHeader(row: ExcelJS.Row) {
  styleBand(row, FOOD_EXCEL_PRIMARY);
}

export function styleFoodExcelTotal(row: ExcelJS.Row) {
  styleBand(row, FOOD_EXCEL_BLACK);
}

export function configureFoodExcelSheet(sheet: ExcelJS.Worksheet, lastColumn: string, lastRow: number) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = `A1:${lastColumn}${Math.max(lastRow, 1)}`;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  for (let index = 2; index <= lastRow; index++) {
    const row = sheet.getRow(index);
    row.height = 15;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = FOOD_EXCEL_FONT;
      cell.alignment = { vertical: "middle" };
    });
  }
}
