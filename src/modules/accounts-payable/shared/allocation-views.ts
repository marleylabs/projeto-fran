// Perspectivas de RATEIO compartilhadas (Alimentação, Café da Manhã, Cesta Básica). Função pura (sem Prisma/server-only):
// recebe linhas JÁ CALCULADAS pelo módulo (valor final em centavos + snapshots de Empresa/CC/Departamento) e só AGRUPA.
// Nenhuma visão recalcula benefício: todas somam os mesmos centavos, então
//   Departamento = Centro de Custo = Empresa/Departamento = Empresa/CC/Departamento = total do lançamento.
// Chaves: Empresa pelo id do snapshot (companyId) quando houver; CC/Departamento pelo texto normalizado do snapshot
// (não há id histórico para eles). Vazio vira "Sem departamento"/"Sem centro de custo" — a linha nunca é descartada.
import { comparePtBr } from "@/lib/sorting/ptBr";

export const ALLOCATION_EMPTY_DEPARTMENT = "Sem departamento";
export const ALLOCATION_EMPTY_COST_CENTER = "Sem centro de custo";
export const ALLOCATION_EMPTY_COMPANY = "Sem empresa";

export type AllocationLevel = "company" | "costCenter" | "department";
export const ALLOCATION_VIEWS = [
  { id: "department", label: "Departamento", levels: ["department"] },
  { id: "costCenter", label: "Centro de Custo", levels: ["costCenter"] },
  { id: "companyDepartment", label: "Empresa / Departamento", levels: ["company", "department"] },
  { id: "companyCostCenterDepartment", label: "Empresa / CC / Departamento", levels: ["company", "costCenter", "department"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; levels: readonly AllocationLevel[] }>;
export type AllocationViewId = (typeof ALLOCATION_VIEWS)[number]["id"];
export const ALLOCATION_LEVEL_LABEL: Record<AllocationLevel, string> = { company: "Empresa", costCenter: "Centro de Custo", department: "Departamento" };

/** Linha normalizada: uma alocação (colaborador) com o valor FINAL já determinado pela regra do módulo. */
export type AllocationViewRow<T = unknown> = {
  id: string;
  company: string; companyKey: string;
  costCenter: string; costCenterKey: string;
  department: string; departmentKey: string;
  employeeKey: string; employeeName: string;
  cents: number;
  source: T;
};

const collapse = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
const keyOf = (value: string) => value.toLocaleUpperCase("pt-BR");

/** Monta a linha normalizada a partir dos snapshots do módulo (sem consultar cadastro atual). */
export function normalizeAllocationRow<T>(input: { id: string; companyId?: string | null; company?: string | null; costCenter?: string | null; department?: string | null; employeeId?: string | null; employeeName: string; cents: number; source: T }): AllocationViewRow<T> {
  if (!Number.isInteger(input.cents)) throw new Error(`Valor do rateio deve estar em centavos inteiros (${input.employeeName}).`);
  const company = collapse(input.company) || ALLOCATION_EMPTY_COMPANY;
  const costCenter = collapse(input.costCenter) || ALLOCATION_EMPTY_COST_CENTER;
  const department = collapse(input.department) || ALLOCATION_EMPTY_DEPARTMENT;
  const employeeName = collapse(input.employeeName);
  return {
    id: input.id,
    company, companyKey: input.companyId ? `id:${input.companyId}` : `name:${keyOf(company)}`,
    costCenter, costCenterKey: keyOf(costCenter),
    department, departmentKey: keyOf(department),
    employeeKey: input.employeeId ? `id:${input.employeeId}` : `name:${keyOf(employeeName)}`,
    employeeName,
    cents: input.cents,
    source: input.source,
  };
}

export type AllocationNode<T = unknown> = { key: string; level: AllocationLevel; label: string; cents: number; people: number; children: AllocationNode<T>[]; rows: AllocationViewRow<T>[] };
export type AllocationTree<T = unknown> = { view: AllocationViewId; nodes: AllocationNode<T>[]; totalCents: number; people: number; consistent: boolean };

const levelKey = (row: AllocationViewRow, level: AllocationLevel) => (level === "company" ? row.companyKey : level === "costCenter" ? row.costCenterKey : row.departmentKey);
const levelLabel = (row: AllocationViewRow, level: AllocationLevel) => (level === "company" ? row.company : level === "costCenter" ? row.costCenter : row.department);
const sumCents = (rows: readonly AllocationViewRow[]) => rows.reduce((total, row) => total + row.cents, 0);
const peopleOf = (rows: readonly AllocationViewRow[]) => new Set(rows.map((row) => row.employeeKey)).size;
const byEmployee = <T>(rows: AllocationViewRow<T>[]) => [...rows].sort((a, b) => comparePtBr(a.employeeName, b.employeeName) || comparePtBr(a.id, b.id));

function group<T>(rows: AllocationViewRow<T>[], levels: readonly AllocationLevel[], prefix: string): AllocationNode<T>[] {
  const [level, ...rest] = levels;
  if (!level) return [];
  const buckets = new Map<string, AllocationViewRow<T>[]>();
  for (const row of rows) buckets.set(levelKey(row, level), [...(buckets.get(levelKey(row, level)) ?? []), row]);
  return [...buckets]
    .map(([key, items]) => {
      const path = `${prefix}${level}:${key}`;
      const children = group(items, rest, `${path}/`);
      return { key: path, level, label: levelLabel(items[0], level), cents: sumCents(items), people: peopleOf(items), children, rows: byEmployee(items) };
    })
    .sort((a, b) => comparePtBr(a.label, b.label) || comparePtBr(a.key, b.key));
}

// Cada nó fecha com os filhos e o total fecha com a soma dos nós de topo.
function nodeConsistent(node: AllocationNode): boolean {
  const own = sumCents(node.rows);
  if (own !== node.cents) return false;
  if (!node.children.length) return true;
  return node.children.reduce((total, child) => total + child.cents, 0) === node.cents && node.children.every(nodeConsistent);
}

export function buildAllocationTree<T>(rows: readonly AllocationViewRow<T>[], view: AllocationViewId): AllocationTree<T> {
  const definition = ALLOCATION_VIEWS.find((item) => item.id === view)!;
  const nodes = group([...rows], definition.levels, "");
  const totalCents = sumCents(rows);
  return { view, nodes, totalCents, people: peopleOf(rows), consistent: nodes.reduce((total, node) => total + node.cents, 0) === totalCents && nodes.every(nodeConsistent) };
}

export function buildAllocationViews<T>(rows: readonly AllocationViewRow<T>[], views: readonly AllocationViewId[] = ALLOCATION_VIEWS.map((view) => view.id)) {
  return Object.fromEntries(views.map((view) => [view, buildAllocationTree(rows, view)])) as Partial<Record<AllocationViewId, AllocationTree<T>>>;
}

/** Validação obrigatória antes de exibir/exportar: cada visão fecha consigo mesma e com o total do lançamento. */
export function assertAllocationViews(views: Partial<Record<AllocationViewId, AllocationTree>>, expectedCents: number, context: string) {
  for (const tree of Object.values(views)) {
    if (!tree) continue;
    const label = ALLOCATION_VIEWS.find((view) => view.id === tree.view)!.label;
    if (!tree.consistent || tree.totalCents !== expectedCents) throw new Error(`Inconsistência no rateio de ${context} (${label}): ${(tree.totalCents / 100).toFixed(2)} ≠ ${(expectedCents / 100).toFixed(2)}.`);
  }
}
