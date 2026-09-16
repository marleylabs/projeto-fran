import ExcelJS from "exceljs";
import { FOOD_MA_COLUMNS, FOOD_PA_COLUMNS } from "./columns";

export type FoodTemplateLocality = "MA" | "PA";

const HEADER_FILL = "FF720062";
const HEADER_FONT = "FFFFFFFF";
const BORDER_COLOR = "FFE6C7E3";
const MONEY_FORMAT = 'R$ #,##0.00';

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });
}

function addInstructions(workbook: ExcelJS.Workbook, locality: FoodTemplateLocality) {
  const sheet = workbook.addWorksheet("INSTRUÇÕES", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = [{ width: 115 }];
  sheet.addRow([`MÁSCARA OFICIAL — ALIMENTAÇÃO ${locality}`]);
  sheet.addRow([]);
  const instructions = locality === "MA"
    ? [
        "Preencha uma linha para cada refeição/ocorrência.",
        "DATA: utilize uma data válida no formato DD/MM/AAAA.",
        "NOME: informe o nome do colaborador.",
        "SETOR: informe o setor do colaborador.",
        "Não altere, remova ou renomeie os cabeçalhos da aba ALIMENTAÇÃO MA.",
        "Não inclua totais, subtotais ou linhas de título na área de dados.",
      ]
    : [
        "Preencha uma linha para cada refeição/ocorrência.",
        "DATA: utilize uma data válida no formato DD/MM/AAAA; a competência será identificada por esta coluna.",
        "ANO e MÊS: campos auxiliares opcionais, sem fórmulas; podem permanecer em branco.",
        "NOME e DPTO: informe o colaborador e seu departamento.",
        "EMISSÃO NF e RESTAURANTE: campos obrigatórios do rateio oficial.",
        "VALOR: informe o valor da ocorrência como número ou moeda.",
        "Não renomeie a aba RATEIO 2.0, a tabela RateioOficial ou seus cabeçalhos.",
        "Não inclua totais ou subtotais dentro da tabela.",
      ];
  instructions.forEach((instruction, index) =>
    sheet.addRow([`${index + 1}. ${instruction}`]),
  );
  sheet.getRow(1).font = { bold: true, size: 15, color: { argb: HEADER_FILL } };
  sheet.getColumn(1).alignment = { vertical: "top", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 2, showGridLines: false }];
}

function addMaSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("ALIMENTAÇÃO MA", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addTable({
    name: "RateioMA",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium4", showRowStripes: true },
    columns: FOOD_MA_COLUMNS.map((name) => ({ name })),
    rows: [[null, null, null]],
  });
  sheet.columns = [{ width: 16 }, { width: 38 }, { width: 30 }];
  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = { from: "A1", to: "C1" };
}

function addPaSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("RATEIO 2.0", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addTable({
    name: "RateioOficial",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium4", showRowStripes: true },
    columns: FOOD_PA_COLUMNS.map((name) => ({ name })),
    rows: [[null, null, null, null, null, null, null, null]],
  });
  sheet.columns = [
    { width: 16 },
    { width: 10 },
    { width: 12 },
    { width: 38 },
    { width: 30 },
    { width: 18 },
    { width: 30 },
    { width: 18 },
  ];
  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  sheet.getColumn(2).numFmt = "0";
  sheet.getColumn(3).numFmt = "@";
  sheet.getColumn(8).numFmt = MONEY_FORMAT;
  styleHeader(sheet.getRow(1));
}

export async function generateFoodTemplate(locality: FoodTemplateLocality) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão Administrativa";
  workbook.subject = `Máscara oficial de Alimentação ${locality}`;
  workbook.created = new Date();
  workbook.modified = new Date();

  if (locality === "MA") addMaSheet(workbook);
  else addPaSheet(workbook);
  addInstructions(workbook, locality);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
