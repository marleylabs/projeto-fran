// Base do rateio da Alimentação para as 4 perspectivas (Departamento, CC, Empresa/Depto, Empresa/CC/Depto). Função pura,
// usada pelo servidor (payload da tela) e pelo XLSX — a mesma base nos dois. Só AGRUPA o valor já salvo de cada refeição
// incluída (em centavos); nada é recalculado nem lido do cadastro atual.
//   Departamento: setor confirmado/recebido da refeição (mesma fonte de sempre).
//   Centro de Custo: snapshot FoodMealOccurrence.costCenter (null = anterior à captura → "Sem centro de custo").
//   Empresa MA: snapshot FoodMealOccurrence.companyId/company (null = anterior à captura → "Sem empresa").
//   Empresa PA: DERIVADA da Emissão NF salva (NF 01 → BOINGA, NF 02 → PROJETA; regra de invoice-company.ts, inalterada).
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { comparePtBr } from "@/lib/sorting/ptBr";
import { amountToCents } from "@/modules/accounts-payable/breakfast/rateio";
import { FOOD_PA_INVOICES, FOOD_PA_UNIDENTIFIED_COMPANY, foodPaInvoiceLabel, parseFoodPaInvoice } from "./invoice-company";

type NumericValue = number | string | { toString(): string };
export type FoodRateioViewOccurrence = {
  employeeId: string | null; normalizedReceivedName: string; receivedName: string; officialName: string | null;
  receivedDepartment: string; confirmedDepartment: string | null; invoiceEmission?: string | null; mealQuantity?: number;
  amount: NumericValue; included: boolean;
  costCenter?: string | null; companyId?: string | null; company?: string | null;
};
/** Uma linha por colaborador + Empresa + CC + Departamento (refeições com snapshots diferentes ficam separadas). */
export type FoodRateioViewRow = { id: string; employeeId: string; employeeName: string; companyId: string | null; company: string | null; costCenter: string | null; department: string; meals: number; cents: number; invoiceEmission: string | null };

export function buildFoodRateioViewRows(locality: string, occurrences: readonly FoodRateioViewOccurrence[]) {
  const rows = new Map<string, FoodRateioViewRow>();
  let legacyCompany = 0, legacyCostCenter = 0;
  for (const occurrence of occurrences.filter((item) => item.included)) {
    const identity = occurrence.employeeId || occurrence.normalizedReceivedName || occurrence.receivedName;
    const department = normalizeOrganizationalValue(occurrence.confirmedDepartment ?? occurrence.receivedDepartment);
    let companyId: string | null = null, company: string | null = null, invoiceEmission: string | null = null;
    if (locality === "PA") {
      const code = parseFoodPaInvoice(occurrence.invoiceEmission);
      company = code ? FOOD_PA_INVOICES[code].company : FOOD_PA_UNIDENTIFIED_COMPANY;
      invoiceEmission = code ? foodPaInvoiceLabel(code) : occurrence.invoiceEmission?.trim() || null;
    } else {
      companyId = occurrence.companyId ?? null; company = occurrence.company ?? null;
      if (!company) legacyCompany += 1;
    }
    const costCenter = occurrence.costCenter?.trim() || null;
    if (!costCenter) legacyCostCenter += 1;
    const key = [identity, companyId ?? company ?? "", costCenter ?? "", department].join("|");
    const current = rows.get(key) ?? { id: key, employeeId: identity, employeeName: occurrence.officialName ?? occurrence.receivedName, companyId, company, costCenter, department, meals: 0, cents: 0, invoiceEmission };
    current.employeeName = occurrence.officialName ?? occurrence.receivedName;
    current.meals += occurrence.mealQuantity ?? 1;
    current.cents += amountToCents(occurrence.amount);
    rows.set(key, current);
  }
  const list = [...rows.values()].sort((a, b) => comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id));
  return { rows: list, totalCents: list.reduce((sum, row) => sum + row.cents, 0), legacyCompany, legacyCostCenter };
}
