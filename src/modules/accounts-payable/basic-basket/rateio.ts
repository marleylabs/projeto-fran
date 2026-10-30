// Cesta Básica — agregações puras de leitura (tela e XLSX), sempre a partir dos snapshots das linhas.
//   Rateio:  Empresa → Departamento → Colaborador
//   Resumo:  Empresa → Centro de Custo (mesma decisão do Café da Manhã), com cada componente somado.
// Tudo em centavos; cada nível precisa fechar com o nível de cima (consistent = false → erro no XLSX).
import { comparePtBr } from "@/lib/sorting/ptBr";
import { amountToCents, breakfastCostCenterLabel } from "@/modules/accounts-payable/breakfast/rateio";

// Valor como vem do banco (Prisma.Decimal), da API (string) ou de teste (number); amountToCents converte sem float.
type Numeric = { toString(): string } | string | number;
/** Campos mínimos do snapshot de uma alocação usados nas agregações (tela e XLSX). */
export type BasicBasketRateioRow = {
  employeeId: string | null; employeeName: string; company: string; department: string | null; costCenter: string | null;
  driverBonus: Numeric; agreementAmount: Numeric; basketAmount: Numeric; retroactiveAmount: Numeric; amount: Numeric;
};
export type BasicBasketTotals = { people: number; driverBonusCents: number; agreementCents: number; basketCents: number; retroactiveCents: number; totalCents: number };

const EMPTY_DEPARTMENT = "Não informado";
// Pessoa distinta: employeeId; sem id (linha legada/sem vínculo), o nome normalizado.
const personKey = (row: BasicBasketRateioRow) => row.employeeId ?? row.employeeName.trim().toLocaleLowerCase("pt-BR");
/** Soma cada componente em centavos e conta PESSOAS distintas (não linhas). */
export function sumBasicBasket(rows: readonly BasicBasketRateioRow[]): BasicBasketTotals {
  return rows.reduce((total, row) => ({
    people: total.people,
    driverBonusCents: total.driverBonusCents + amountToCents(row.driverBonus),
    agreementCents: total.agreementCents + amountToCents(row.agreementAmount),
    basketCents: total.basketCents + amountToCents(row.basketAmount),
    retroactiveCents: total.retroactiveCents + amountToCents(row.retroactiveAmount),
    totalCents: total.totalCents + amountToCents(row.amount),
  }), { people: new Set(rows.map(personKey)).size, driverBonusCents: 0, agreementCents: 0, basketCents: 0, retroactiveCents: 0, totalCents: 0 });
}

// Agrupa por chave e devolve os grupos em ordem alfabética pt-BR.
function groupBy<T extends BasicBasketRateioRow>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups].sort(([a], [b]) => comparePtBr(a, b));
}

/** Rateio Empresa → Departamento (vazio = "Não informado") → colaboradores (por nome).
 *  consistent: total geral = Σ empresas = Σ departamentos (centavos). */
export function groupBasicBasketByCompanyDepartment<T extends BasicBasketRateioRow>(rows: readonly T[]) {
  const companies = groupBy(rows, (row) => row.company).map(([company, companyRows]) => {
    const departments = groupBy(companyRows, (row) => row.department?.trim() || EMPTY_DEPARTMENT).map(([department, departmentRows]) => ({ department, rows: [...departmentRows].sort((a, b) => comparePtBr(a.employeeName, b.employeeName)), totals: sumBasicBasket(departmentRows) }));
    return { company, departments, totals: sumBasicBasket(companyRows) };
  });
  const totals = sumBasicBasket(rows);
  const companiesCents = companies.reduce((sum, company) => sum + company.totals.totalCents, 0);
  const departmentsCents = companies.reduce((sum, company) => sum + company.departments.reduce((inner, department) => inner + department.totals.totalCents, 0), 0);
  return { companies, totals, consistent: totals.totalCents === companiesCents && totals.totalCents === departmentsCents };
}

/** Resumo Empresa → Centro de Custo (rótulo do Café: breakfastCostCenterLabel). consistent também confere
 *  total = Σ componentes. Usado na aba Resumo e no XLSX (que lança erro se inconsistente). */
export function groupBasicBasketByCompanyCostCenter<T extends BasicBasketRateioRow>(rows: readonly T[]) {
  const companies = groupBy(rows, (row) => row.company).map(([company, companyRows]) => ({
    company,
    costCenters: groupBy(companyRows, (row) => breakfastCostCenterLabel(row.costCenter)).map(([costCenter, costCenterRows]) => ({ costCenter, totals: sumBasicBasket(costCenterRows) })),
    totals: sumBasicBasket(companyRows),
  }));
  const totals = sumBasicBasket(rows);
  const costCentersCents = companies.reduce((sum, company) => sum + company.costCenters.reduce((inner, costCenter) => inner + costCenter.totals.totalCents, 0), 0);
  const companiesCents = companies.reduce((sum, company) => sum + company.totals.totalCents, 0);
  // cada linha: Total = Bonificação + Acordo + Cesta + Retroativo (também conferido no agregado)
  const componentsCents = totals.driverBonusCents + totals.agreementCents + totals.basketCents + totals.retroactiveCents;
  return { companies, totals, consistent: totals.totalCents === companiesCents && totals.totalCents === costCentersCents && totals.totalCents === componentsCents };
}
