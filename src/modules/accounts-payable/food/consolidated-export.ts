import ExcelJS from "exceljs";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { configureFoodExcelSheet, FOOD_EXCEL_MONEY_FORMAT, styleFoodExcelHeader, styleFoodExcelTotal } from "./excel-style";

type NumericValue = number | string | { toString(): string };
export type ConsolidatedFoodBatch = {
  id: string;
  locality: string;
  cycle: number;
  validRows: number;
  totalAmount: NumericValue;
  competence: { year: number; month: number };
  administrativeEntity: { tradeName: string };
  allocations: Array<{
    id: string;
    sourceIdentifier: string | null;
    employeeName: string;
    department: string;
    locality: string;
    unitPrice: NumericValue;
    amount: NumericValue;
  }>;
};

function employeeIdentity(row: ConsolidatedFoodBatch["allocations"][number]) {
  return row.sourceIdentifier || row.employeeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim();
}

function contextName(batch: ConsolidatedFoodBatch) {
  return batch.locality === "MA" && batch.cycle ? `MA-${batch.cycle}` : batch.locality;
}

function assertMoneyEqual(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) > 0.005) throw new Error(`Inconsistência no consolidado (${label}): ${actual.toFixed(2)} ≠ ${expected.toFixed(2)}.`);
}

export function buildFoodConsolidatedWorkbook(batches: ConsolidatedFoodBatch[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão Administrativa";
  workbook.created = new Date();

  const ordered = [...batches].sort((a,b)=>comparePtBr(a.locality,b.locality)||a.cycle-b.cycle||comparePtBr(a.administrativeEntity.tradeName,b.administrativeEntity.tradeName)||comparePtBr(a.id,b.id));
  const general = workbook.addWorksheet("Resumo Geral");
  general.addRow(["Localidade", "Ciclo", "Fornecedor", "Refeições", "Valor"]); styleFoodExcelHeader(general.getRow(1));
  for (const batch of ordered) general.addRow([batch.locality, batch.cycle || "Mensal", batch.administrativeEntity.tradeName, batch.validRows, Number(batch.totalAmount)]);
  const totalOccurrences = ordered.reduce((sum, batch) => sum + batch.validRows, 0);
  const totalAmount = ordered.reduce((sum, batch) => sum + Number(batch.totalAmount), 0);
  const generalTotal = general.addRow(["TOTAL", null, null, totalOccurrences, totalAmount]); styleFoodExcelTotal(generalTotal);
  general.columns = [{ width: 14 }, { width: 16 }, { width: 32 }, { width: 18 }, { width: 18 }];
  general.getColumn(5).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  for (let row = 2; row <= general.rowCount; row++) for (let column = 1; column <= 5; column++) general.getCell(row,column).alignment = { horizontal: "center", vertical: "middle" };
  configureFoodExcelSheet(general, "E", general.rowCount);
  styleFoodExcelTotal(generalTotal);

  const contexts = new Map<string, ConsolidatedFoodBatch[]>();
  for (const batch of ordered) contexts.set(contextName(batch), [...(contexts.get(contextName(batch)) ?? []), batch]);
  for (const [context, contextBatches] of contexts) {
    const allocations = contextBatches.flatMap((batch) => batch.allocations.map((allocation) => ({ batch, allocation, sector: normalizeOrganizationalValue(allocation.department) })));
    const expectedAmount = contextBatches.reduce((sum, batch) => sum + Number(batch.totalAmount), 0);
    assertMoneyEqual(`${context} / colaboradores`, allocations.reduce((sum, row) => sum + Number(row.allocation.amount), 0), expectedAmount);

    const people = workbook.addWorksheet(`Colaboradores ${context}`.slice(0,31));
    people.addRow(["Colaborador", "Setor", "Localidade", "Fornecedor", "Competência", "Valor unitário", "Valor"]); styleFoodExcelHeader(people.getRow(1));
    allocations.sort((a,b)=>comparePtBr(a.sector,b.sector)||comparePtBr(a.allocation.employeeName,b.allocation.employeeName)||comparePtBr(a.batch.administrativeEntity.tradeName,b.batch.administrativeEntity.tradeName)||comparePtBr(a.allocation.id,b.allocation.id));
    for (const { batch, allocation, sector } of allocations) people.addRow([allocation.employeeName, sector, batch.locality, batch.administrativeEntity.tradeName, `${String(batch.competence.month).padStart(2,"0")}/${batch.competence.year}`, Number(allocation.unitPrice), Number(allocation.amount)]);
    people.columns = [{ width: 40 }, { width: 16 }, { width: 10 }, { width: 11 }, { width: 12 }, { width: 13 }, { width: 11 }];
    people.getColumn(6).numFmt = FOOD_EXCEL_MONEY_FORMAT; people.getColumn(7).numFmt = FOOD_EXCEL_MONEY_FORMAT;
    configureFoodExcelSheet(people, "G", people.rowCount);
    for (let row=2;row<=people.rowCount;row++) { people.getCell(row,1).alignment={horizontal:"left",vertical:"middle"}; for(let column=2;column<=5;column++)people.getCell(row,column).alignment={horizontal:"center",vertical:"middle"}; people.getCell(row,6).alignment={horizontal:"right",vertical:"middle"};people.getCell(row,7).alignment={horizontal:"right",vertical:"middle"}; }

    const grouped = new Map<string,{employees:Set<string>;amount:number}>();
    const allEmployees = new Set<string>();
    for (const { allocation, sector } of allocations) { const identity=employeeIdentity(allocation);allEmployees.add(identity);const value=grouped.get(sector)??{employees:new Set<string>(),amount:0};value.employees.add(identity);value.amount+=Number(allocation.amount);grouped.set(sector,value); }
    const sectorAmount = [...grouped.values()].reduce((sum,value)=>sum+value.amount,0); assertMoneyEqual(`${context} / setores`, sectorAmount, expectedAmount);
    const sectors = workbook.addWorksheet(`Setores ${context}`.slice(0,31));
    sectors.addRow(["Setor", "Colaboradores", "Valor total"]); styleFoodExcelHeader(sectors.getRow(1));
    for (const [sector,value] of [...grouped].sort(([a],[b])=>comparePtBr(a,b))) sectors.addRow([sector,value.employees.size,value.amount]);
    const sectorTotal=sectors.addRow(["TOTAL",allEmployees.size,sectorAmount]); styleFoodExcelTotal(sectorTotal);
    sectors.columns=[{width:18},{width:14},{width:14}];sectors.getColumn(3).numFmt=FOOD_EXCEL_MONEY_FORMAT;
    configureFoodExcelSheet(sectors,"C",sectors.rowCount);
    for(let row=2;row<sectors.rowCount;row++){sectors.getCell(row,1).alignment={horizontal:"left",vertical:"middle"};sectors.getCell(row,2).alignment={horizontal:"center",vertical:"middle"};sectors.getCell(row,3).alignment={horizontal:"right",vertical:"middle"};}
    styleFoodExcelTotal(sectorTotal);
  }
  return workbook;
}

export async function exportFoodConsolidated(batches: ConsolidatedFoodBatch[]) {
  return buildFoodConsolidatedWorkbook(batches).xlsx.writeBuffer();
}
