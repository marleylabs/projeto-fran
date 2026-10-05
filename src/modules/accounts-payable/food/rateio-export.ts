import ExcelJS from "exceljs";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import {
  configureFoodExcelSheet,
  FOOD_EXCEL_MONEY_FORMAT,
  styleFoodExcelHeader,
  styleFoodExcelTotal,
} from "./excel-style";
import { buildFoodPaCompanyRateio } from "./invoice-company";

type NumericValue = number | string | { toString(): string };
export type FoodRateioBatch = {
  // PA: o rateio por colaborador ganha Empresa (derivada da Emissão NF) e a NF ao lado das Refeições.
  locality?: string;
  mealOccurrences: Array<{
    id: string;
    employeeId: string | null;
    normalizedReceivedName: string;
    receivedName: string;
    officialName: string | null;
    receivedDepartment: string;
    confirmedDepartment: string | null;
    mealQuantity?: number;
    restaurantName?: string | null;
    invoiceEmission?: string | null;
    amount: NumericValue;
    included: boolean;
  }>;
};

function personIdentity(row: FoodRateioBatch["mealOccurrences"][number]) {
  return row.employeeId || row.normalizedReceivedName || row.receivedName;
}

function assertEqual(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) > 0.005) {
    throw new Error(`Inconsistência no rateio de alimentação (${label}): ${actual.toFixed(2)} ≠ ${expected.toFixed(2)}.`);
  }
}

export function buildFoodRateioWorkbook(batch: FoodRateioBatch) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão Administrativa";
  workbook.created = new Date();

  const people = new Map<string, { name: string; sector: string; meals: number; amount: number; restaurants: Set<string>; invoices: Set<string> }>();
  for (const row of batch.mealOccurrences.filter((occurrence) => occurrence.included)) {
    const key = personIdentity(row);
    const sector = normalizeOrganizationalValue(row.confirmedDepartment ?? row.receivedDepartment);
    const current = people.get(key) ?? { name: row.officialName ?? row.receivedName, sector, meals: 0, amount: 0, restaurants: new Set<string>(), invoices: new Set<string>() };
    current.name = row.officialName ?? row.receivedName;
    current.sector = sector;
    current.meals += row.mealQuantity ?? 1;
    current.amount += Number(row.amount);
    if (row.restaurantName) current.restaurants.add(row.restaurantName);
    if (row.invoiceEmission) current.invoices.add(row.invoiceEmission);
    people.set(key, current);
  }

  const sectors = new Map<string, { employees: Set<string>; meals: number; amount: number }>();
  for (const [identity, person] of people) {
    const current = sectors.get(person.sector) ?? { employees: new Set<string>(), meals: 0, amount: 0 };
    current.employees.add(identity);
    current.meals += person.meals;
    current.amount += person.amount;
    sectors.set(person.sector, current);
  }

  const orderedPeople = [...people.values()].sort((a, b) => comparePtBr(a.sector, b.sector) || comparePtBr(a.name, b.name));
  const totalMeals = orderedPeople.reduce((sum, person) => sum + person.meals, 0);
  const totalAmount = orderedPeople.reduce((sum, person) => sum + person.amount, 0);

  const summary = workbook.addWorksheet("Resumo por Setor");
  summary.addRow(["Setor", "Colaboradores", "Refeições", "Valor"]);
  styleFoodExcelHeader(summary.getRow(1));
  for (const [sector, value] of [...sectors].sort(([a], [b]) => comparePtBr(a, b))) {
    summary.addRow([sector, value.employees.size, value.meals, value.amount]);
  }
  const summaryTotal = summary.addRow(["TOTAL", people.size, totalMeals, totalAmount]);
  summary.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 18 }];
  summary.getColumn(4).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  configureFoodExcelSheet(summary, "D", summary.rowCount);
  for (let row = 2; row < summary.rowCount; row++) {
    summary.getCell(row, 1).alignment = { horizontal: "left", vertical: "middle" };
    summary.getCell(row, 2).alignment = { horizontal: "center", vertical: "middle" };
    summary.getCell(row, 3).alignment = { horizontal: "center", vertical: "middle" };
    summary.getCell(row, 4).alignment = { horizontal: "right", vertical: "middle" };
  }
  styleFoodExcelTotal(summaryTotal);
  summaryTotal.getCell(4).numFmt = FOOD_EXCEL_MONEY_FORMAT;

  if (batch.locality === "PA") {
    addPaCompanySheets(workbook, batch, totalAmount);
    assertEqual("refeições", sectors.values().reduce((sum, value) => sum + value.meals, 0), totalMeals);
    assertEqual("valor", sectors.values().reduce((sum, value) => sum + value.amount, 0), totalAmount);
    return workbook;
  }

  const allocation = workbook.addWorksheet("Rateio por Colaborador");
  allocation.addRow(["Setor", "Colaborador", "Refeições", "Valor Médio", "Custo", "Restaurante", "Emissão NF"]);
  styleFoodExcelHeader(allocation.getRow(1));
  for (const person of orderedPeople) {
    allocation.addRow([person.sector, person.name, person.meals, person.amount / person.meals, person.amount, [...person.restaurants].join(", "), [...person.invoices].join(", ")]);
  }
  allocation.columns = [{ width: 28 }, { width: 34 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 28 }, { width: 18 }];
  allocation.getColumn(4).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  allocation.getColumn(5).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  configureFoodExcelSheet(allocation, "G", allocation.rowCount);
  for (let row = 2; row <= allocation.rowCount; row++) {
    allocation.getCell(row, 1).alignment = { horizontal: "left", vertical: "middle" };
    allocation.getCell(row, 2).alignment = { horizontal: "left", vertical: "middle" };
    allocation.getCell(row, 3).alignment = { horizontal: "center", vertical: "middle" };
    allocation.getCell(row, 4).alignment = { horizontal: "right", vertical: "middle" };
    allocation.getCell(row, 5).alignment = { horizontal: "right", vertical: "middle" };
  }

  assertEqual("refeições", sectors.values().reduce((sum, value) => sum + value.meals, 0), totalMeals);
  assertEqual("valor", sectors.values().reduce((sum, value) => sum + value.amount, 0), totalAmount);
  return workbook;
}

// PA: "Resumo por Empresa" (Empresa = NF 01 → BOINGA, NF 02 → PROJETA) e "Rateio por Colaborador" com
// Empresa + Emissão NF imediatamente ao lado de Refeições. Uma linha por colaborador + NF.
function addPaCompanySheets(workbook: ExcelJS.Workbook, batch: FoodRateioBatch, totalAmount: number) {
  const rateio = buildFoodPaCompanyRateio(batch.mealOccurrences);
  assertEqual("empresas", rateio.companiesCents / 100, totalAmount);

  const companySheet = workbook.addWorksheet("Resumo por Empresa");
  companySheet.addRow(["Empresa", "Colaboradores", "Refeições", "Valor"]);
  styleFoodExcelHeader(companySheet.getRow(1));
  for (const company of rateio.companies) companySheet.addRow([company.company, company.collaborators, company.meals, company.amountCents / 100]);
  const companyTotal = companySheet.addRow(["TOTAL", new Set(rateio.companies.flatMap((company) => company.people.map((person) => person.key.split("|")[0]))).size, rateio.companies.reduce((sum, company) => sum + company.meals, 0), rateio.totalCents / 100]);
  companySheet.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 18 }];
  companySheet.getColumn(4).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  configureFoodExcelSheet(companySheet, "D", companySheet.rowCount);
  for (let row = 2; row < companySheet.rowCount; row++) {
    companySheet.getCell(row, 1).alignment = { horizontal: "left", vertical: "middle" };
    companySheet.getCell(row, 2).alignment = { horizontal: "center", vertical: "middle" };
    companySheet.getCell(row, 3).alignment = { horizontal: "center", vertical: "middle" };
    companySheet.getCell(row, 4).alignment = { horizontal: "right", vertical: "middle" };
  }
  styleFoodExcelTotal(companyTotal);
  companyTotal.getCell(4).numFmt = FOOD_EXCEL_MONEY_FORMAT;

  const restaurantsByIdentity = new Map<string, Set<string>>();
  for (const row of batch.mealOccurrences.filter((occurrence) => occurrence.included)) {
    const identity = personIdentity(row);
    if (row.restaurantName) restaurantsByIdentity.set(identity, (restaurantsByIdentity.get(identity) ?? new Set<string>()).add(row.restaurantName));
  }
  const allocation = workbook.addWorksheet("Rateio por Colaborador");
  allocation.addRow(["Empresa", "Setor", "Colaborador", "Refeições", "Emissão NF", "Valor Médio", "Custo", "Restaurante"]);
  styleFoodExcelHeader(allocation.getRow(1));
  for (const company of rateio.companies)
    for (const person of [...company.people].sort((a, b) => comparePtBr(a.department, b.department) || comparePtBr(a.name, b.name)))
      allocation.addRow([company.company, person.department, person.name, person.meals, person.invoiceEmission, person.amountCents / 100 / person.meals, person.amountCents / 100, [...(restaurantsByIdentity.get(person.key.split("|")[0]) ?? [])].join(", ")]);
  allocation.columns = [{ width: 22 }, { width: 28 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 28 }];
  allocation.getColumn(6).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  allocation.getColumn(7).numFmt = FOOD_EXCEL_MONEY_FORMAT;
  configureFoodExcelSheet(allocation, "H", allocation.rowCount);
  for (let row = 2; row <= allocation.rowCount; row++) {
    for (const column of [1, 2, 3]) allocation.getCell(row, column).alignment = { horizontal: "left", vertical: "middle" };
    for (const column of [4, 5]) allocation.getCell(row, column).alignment = { horizontal: "center", vertical: "middle" };
    for (const column of [6, 7]) allocation.getCell(row, column).alignment = { horizontal: "right", vertical: "middle" };
  }
}
export async function exportFoodRateio(batch: FoodRateioBatch) {
  return buildFoodRateioWorkbook(batch).xlsx.writeBuffer();
}
