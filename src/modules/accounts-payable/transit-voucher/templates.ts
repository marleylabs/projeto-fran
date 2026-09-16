import ExcelJS from "exceljs";
import { TRANSIT_VOUCHER_COLUMNS, TRANSIT_VOUCHER_SHEET_NAME, TRANSIT_VOUCHER_TABLE_NAME } from "./columns";

const PRIMARY = "FFAF1B1B";
const MONEY = 'R$ #,##0.00;[Red]-R$ #,##0.00';

export async function generateTransitVoucherTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão Administrativa";
  workbook.subject = "Máscara oficial de importação de Vale Transporte";
  workbook.created = new Date(); workbook.modified = new Date();
  const sheet = workbook.addWorksheet(TRANSIT_VOUCHER_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addTable({ name: TRANSIT_VOUCHER_TABLE_NAME, ref: "A1", headerRow: true, totalsRow: false, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: TRANSIT_VOUCHER_COLUMNS.map((name) => ({ name })), rows: [[null, null, null, null, null, null, null, null, null, null, null]] });
  sheet.columns = [24, 38, 16, 28, 24, 18, 16, 22, 22, 10, 18].map((width) => ({ width }));
  sheet.getColumn(3).numFmt = "dd/mm/yyyy";
  [7, 8, 9, 11].forEach((index) => { sheet.getColumn(index).numFmt = MONEY; });
  sheet.getColumn(10).numFmt = "0.00";
  for (let row = 2; row <= 1000; row++) {
    sheet.getCell(row, 3).dataValidation = { type: "date", operator: "between", allowBlank: false, formulae: [new Date(2000, 0, 1), new Date(2200, 11, 31)], showErrorMessage: true, errorTitle: "DATA obrigatória", error: "Informe uma data válida." };
    sheet.getCell(row, 10).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: "DIAS inválido", error: "Informe uma quantidade numérica válida." };
  }
  sheet.getRow(1).height = 25; sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY } }; cell.alignment = { vertical: "middle" }; });
  [1, 2, 3, 4, 11].forEach((column) => { sheet.getCell(1, column).note = "Campo obrigatório para validação e rateio."; });
  const instructions = workbook.addWorksheet("INSTRUÇÕES", { views: [{ showGridLines: false, state: "frozen", ySplit: 2 }] });
  instructions.columns = [{ width: 115 }]; instructions.addRow(["MÁSCARA DE IMPORTAÇÃO — VALE TRANSPORTE"]); instructions.addRow([]);
  ["Não altere os nomes das colunas.", "Preencha uma linha para cada colaborador/registro.", "DATA deve estar no formato de data.", "VALOR DIA, DIF MÊS ANTERIOR, DESCONTOS EVENTUAIS e VALOR TOTAL devem conter valores monetários.", "DIF MÊS ANTERIOR pode ser positivo, negativo ou zero.", "DIAS deve conter quantidade numérica.", "Não exclua o cabeçalho.", "Salve o arquivo em XLSX antes do upload.", "Não adicione novas colunas na área oficial de importação."].forEach((text, index) => instructions.addRow([`${index + 1}. ${text}`]));
  instructions.getRow(1).font = { bold: true, size: 15, color: { argb: PRIMARY } }; instructions.getColumn(1).alignment = { wrapText: true, vertical: "top" };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
