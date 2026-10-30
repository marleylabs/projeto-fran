// XLSX do rateio de Despesas de Treinamento (abas "Rateio" e "Departamentos"). Recebe o resultado de
// getTrainingExpenseRateio (server.ts); chamado pela rota .../training-expense/rateio/download (botão da aba Rateio).
// Sem acesso a banco. Antes de gravar, confere em centavos que as linhas fecham com o total rateado e o total dos
// lançamentos; divergência lança Error (o download falha em vez de sair inconsistente).
import ExcelJS from "exceljs";
import { configureFoodExcelSheet, FOOD_EXCEL_MONEY_FORMAT, styleFoodExcelHeader, styleFoodExcelTotal } from "@/modules/accounts-payable/food/excel-style";
import type { getTrainingExpenseRateio } from "./server";

type RateioResult = Awaited<ReturnType<typeof getTrainingExpenseRateio>>;

// Decimal → centavos inteiros só para a conferência (valores de 2 casas; Math.round absorve o erro do float).
const cents = (value: { toString(): string }) => Math.round(Number(value.toString()) * 100);

/** Nome do arquivo: rateio-treinamentos[-slug-do-fornecedor]-AAAA-MM.xlsx (slug sem acentos, até 40 caracteres). */
export function trainingRateioFilename(year: number, month: number, supplierName?: string) {
  const slug = (supplierName ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `rateio-treinamentos${slug ? `-${slug}` : ""}-${year}-${String(month).padStart(2, "0")}.xlsx`;
}

// Mesmos helpers de estilo do rateio de Alimentação (cabeçalho vermelho, total preto, moeda pt-BR).
/** Gera o Buffer do XLSX para a competência (year/month só rotulam as linhas; o filtro já veio aplicado em `data`). */
export async function buildTrainingRateioWorkbook(data: RateioResult, year: number, month: number) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão Administrativa";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Rateio");
  sheet.addRow(["Competência", "Fornecedor", "Colaborador", "Departamento", "Centro de custo", "Treinamento", "Data", "Valor rateado"]);
  styleFoodExcelHeader(sheet.getRow(1));

  let totalCents = 0;
  for (const card of data.cards) {
    for (const department of card.departments) {
      for (const row of department.rows) {
        totalCents += cents(row.amount);
        sheet.addRow([
          `${String(month).padStart(2, "0")}/${year}`, card.supplierName, row.employeeName, department.department,
          row.costCenter, row.trainingDescription, row.trainingDate.toISOString().slice(0, 10).split("-").reverse().join("/"),
          Number(row.amount.toString()),
        ]);
      }
    }
  }
  if (totalCents !== cents(data.totalAllocated) || totalCents !== cents(data.totalAmount)) {
    throw new Error(`Inconsistência no rateio de treinamentos: linhas ${(totalCents / 100).toFixed(2)} ≠ total ${data.totalAmount.toFixed(2)}.`);
  }
  const lastData = sheet.rowCount;
  configureFoodExcelSheet(sheet, "H", lastData);
  const total = sheet.addRow(["TOTAL", "", "", "", "", "", "", Number(data.totalAllocated.toString())]);
  styleFoodExcelTotal(total);
  sheet.columns = [{ width: 12 }, { width: 28 }, { width: 38 }, { width: 22 }, { width: 24 }, { width: 50 }, { width: 12 }, { width: 15 }];
  sheet.getColumn(8).numFmt = FOOD_EXCEL_MONEY_FORMAT;

  const departments = workbook.addWorksheet("Departamentos");
  departments.addRow(["Fornecedor", "Departamento", "Participações", "Valor"]);
  styleFoodExcelHeader(departments.getRow(1));
  for (const card of data.cards) for (const department of card.departments) departments.addRow([card.supplierName, department.department, department.participants, Number(department.amount.toString())]);
  configureFoodExcelSheet(departments, "D", departments.rowCount);
  styleFoodExcelTotal(departments.addRow(["TOTAL", "", data.cards.reduce((sum, card) => sum + card.participations, 0), Number(data.totalAllocated.toString())]));
  departments.columns = [{ width: 28 }, { width: 24 }, { width: 14 }, { width: 15 }];
  departments.getColumn(4).numFmt = FOOD_EXCEL_MONEY_FORMAT;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
