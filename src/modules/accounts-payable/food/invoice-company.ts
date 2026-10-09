// Alimentação PA: a Emissão NF de cada colaborador define a EMPRESA do rateio. Regra fixa e única
// (frontend, backend e XLSX usam somente este módulo):
//   NF 01 → BOINGA
//   NF 02 → PROJETA
// A NF é a origem da classificação (snapshot por FoodMealOccurrence.invoiceEmission); a empresa é
// sempre DERIVADA dela — nunca recebida do frontend nem persistida separadamente, então não existe
// combinação inconsistente (ex.: NF 01 + PROJETA). Não se aplica ao MA.
import { comparePtBr } from "@/lib/sorting/ptBr";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";

export const FOOD_PA_INVOICES = {
  NF_01: { label: "NF 01", company: "BOINGA" },
  NF_02: { label: "NF 02", company: "PROJETA" },
} as const;
export type FoodPaInvoiceCode = keyof typeof FOOD_PA_INVOICES;
export type FoodPaCompany = (typeof FOOD_PA_INVOICES)[FoodPaInvoiceCode]["company"];
export const FOOD_PA_INVOICE_CODES = Object.keys(FOOD_PA_INVOICES) as FoodPaInvoiceCode[];
export const FOOD_PA_UNIDENTIFIED_COMPANY = "Empresa não identificada";
export const FOOD_PA_INVOICE_REQUIRED_MESSAGE = "Informe a Emissão NF (NF 01 ou NF 02) para todos os colaboradores com refeições.";

// Valor interno aceito do formulário/API (estrito): somente NF_01 ou NF_02.
export const isFoodPaInvoiceCode = (value: unknown): value is FoodPaInvoiceCode =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(FOOD_PA_INVOICES, value);

// Leitura do valor PERSISTIDO (tolerante): o lançamento manual grava "NF 01"/"NF 02"; o Upload PA grava
// o texto da planilha como veio (ex.: "NF01", "nf 1", "NF-02"). Fora disso → null (não inventa empresa).
export function parseFoodPaInvoice(value: string | null | undefined): FoodPaInvoiceCode | null {
  if (isFoodPaInvoiceCode(value)) return value;
  const match = /^\s*N\.?\s*F\.?\s*[-_.:º°]*\s*0*([12])\s*$/i.exec(value ?? "");
  return match ? (`NF_0${match[1]}` as FoodPaInvoiceCode) : null;
}

export const foodPaInvoiceLabel = (code: FoodPaInvoiceCode) => FOOD_PA_INVOICES[code].label;

export function foodInvoiceEmissionToCompany(value: string | null | undefined): FoodPaCompany | null {
  const code = parseFoodPaInvoice(value);
  return code ? FOOD_PA_INVOICES[code].company : null;
}

type Numeric = number | string | { toString(): string };
export type FoodPaRateioRow = {
  employeeId: string | null; officialName: string | null; receivedName: string; normalizedReceivedName?: string;
  confirmedDepartment: string | null; receivedDepartment: string; invoiceEmission?: string | null;
  mealQuantity?: number; amount: Numeric; included: boolean;
};
export type FoodPaRateioPerson = { key: string; name: string; department: string; invoiceEmission: string; meals: number; amountCents: number };
export type FoodPaRateioCompany = { company: string; people: FoodPaRateioPerson[]; collaborators: number; meals: number; amountCents: number };

const toCents = (value: Numeric) => Math.round(Number(String(value)) * 100);

// Rateio PA por Empresa → Colaborador. A chave da pessoa inclui a NF: o mesmo colaborador com NF 01
// e NF 02 no mesmo lote aparece nas duas empresas (cada parcela na sua). Valores em centavos.
export function buildFoodPaCompanyRateio(rows: readonly FoodPaRateioRow[]) {
  const people = new Map<string, FoodPaRateioPerson & { company: string }>();
  for (const row of rows.filter((item) => item.included)) {
    const code = parseFoodPaInvoice(row.invoiceEmission);
    const company = code ? FOOD_PA_INVOICES[code].company : FOOD_PA_UNIDENTIFIED_COMPANY;
    const invoiceEmission = code ? foodPaInvoiceLabel(code) : (row.invoiceEmission?.trim() || "—");
    const identity = row.employeeId || row.normalizedReceivedName || row.receivedName;
    const key = `${identity}|${invoiceEmission}`;
    const current = people.get(key) ?? { key, company, name: row.officialName ?? row.receivedName, department: normalizeOrganizationalValue(row.confirmedDepartment ?? row.receivedDepartment), invoiceEmission, meals: 0, amountCents: 0 };
    current.meals += row.mealQuantity ?? 1;
    current.amountCents += toCents(row.amount);
    people.set(key, current);
  }
  const byCompany = new Map<string, FoodPaRateioPerson[]>();
  for (const { company, ...person } of people.values()) byCompany.set(company, [...(byCompany.get(company) ?? []), person]);
  const companies: FoodPaRateioCompany[] = [...byCompany].sort(([a], [b]) => (a === FOOD_PA_UNIDENTIFIED_COMPANY ? 1 : b === FOOD_PA_UNIDENTIFIED_COMPANY ? -1 : comparePtBr(a, b))).map(([company, list]) => {
    const sorted = [...list].sort((a, b) => comparePtBr(a.name, b.name) || comparePtBr(a.invoiceEmission, b.invoiceEmission));
    return { company, people: sorted, collaborators: new Set(sorted.map((person) => person.key.split("|")[0])).size, meals: sorted.reduce((sum, person) => sum + person.meals, 0), amountCents: sorted.reduce((sum, person) => sum + person.amountCents, 0) };
  });
  const totalCents = rows.filter((item) => item.included).reduce((sum, row) => sum + toCents(row.amount), 0);
  const companiesCents = companies.reduce((sum, company) => sum + company.amountCents, 0);
  return { companies, totalCents, companiesCents, consistent: totalCents === companiesCents };
}
