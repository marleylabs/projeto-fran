// Rateio consolidado do Café da Manhã: Empresa → Centro de Custo → total. Função pura (sem
// Prisma/server-only), usada pela tela (Resumo), pelo XLSX (aba Resumo) e pela checagem de
// integridade do backend. O centro de custo é SEMPRE o snapshot salvo em BreakfastAllocation —
// nunca o cadastro atual do colaborador — para o histórico da competência não mudar.
// Departamento (TOPOGEO) continua sendo a regra operacional de elegibilidade; não é usado aqui.
import { comparePtBr } from "@/lib/sorting/ptBr";

export const BREAKFAST_EMPTY_COST_CENTER = "Sem centro de custo";

export type BreakfastRateioRow = { company: string; costCenter: string | null; employeeId: string | null; employeeName: string; amount: { toString(): string } | string | number };
export type BreakfastCostCenterGroup<T> = { costCenter: string; people: number; totalCents: number; rows: T[] };
export type BreakfastCompanyGroup<T> = { company: string; people: number; totalCents: number; costCenters: BreakfastCostCenterGroup<T>[] };

// Valor decimal (string/Decimal, até 4 casas no banco) → centavos inteiros, sem passar por float.
export function amountToCents(value: { toString(): string } | string | number) {
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Valor inválido no rateio do Café da Manhã: ${text}`);
  const decimals = (match[3] ?? "").padEnd(3, "0");
  const cents = Number(match[2]) * 100 + Number(decimals.slice(0, 2)) + (Number(decimals[2]) >= 5 ? 1 : 0);
  return match[1] ? -cents : cents;
}

export const breakfastCostCenterLabel = (costCenter: string | null | undefined) => costCenter?.trim().replace(/\s+/g, " ") || BREAKFAST_EMPTY_COST_CENTER;
const personKey = (row: BreakfastRateioRow) => row.employeeId ?? row.employeeName.trim().toLocaleLowerCase("pt-BR");

// Chave conceitual = empresa + centro de custo: o mesmo CC em empresas diferentes fica separado.
export function groupBreakfastByCompanyCostCenter<T extends BreakfastRateioRow>(rows: readonly T[]) {
  const companies = new Map<string, Map<string, T[]>>();
  for (const row of rows) {
    const costCenters = companies.get(row.company) ?? new Map<string, T[]>();
    const key = breakfastCostCenterLabel(row.costCenter);
    costCenters.set(key, [...(costCenters.get(key) ?? []), row]);
    companies.set(row.company, costCenters);
  }
  const sum = (items: readonly T[]) => items.reduce((total, row) => total + amountToCents(row.amount), 0);
  const people = (items: readonly T[]) => new Set(items.map(personKey)).size;
  const groups: BreakfastCompanyGroup<T>[] = [...companies].sort(([a], [b]) => comparePtBr(a, b)).map(([company, costCenters]) => {
    const children = [...costCenters].sort(([a], [b]) => comparePtBr(a, b)).map(([costCenter, items]) => ({ costCenter, people: people(items), totalCents: sum(items), rows: items }));
    return { company, people: people(children.flatMap((child) => child.rows)), totalCents: children.reduce((total, child) => total + child.totalCents, 0), costCenters: children };
  });
  const grandCents = sum(rows);
  const companiesCents = groups.reduce((total, group) => total + group.totalCents, 0);
  const costCentersCents = groups.reduce((total, group) => total + group.costCenters.reduce((inner, child) => inner + child.totalCents, 0), 0);
  return { companies: groups, grandCents, companiesCents, costCentersCents, people: people(rows), consistent: grandCents === companiesCents && grandCents === costCentersCents };
}
