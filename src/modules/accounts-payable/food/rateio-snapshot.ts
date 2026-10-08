// Snapshot histórico de Centro de Custo e Empresa por refeição da Alimentação (Fase 7E.2) — SÓ para agrupar o rateio;
// nenhum desses campos participa do cálculo (o valor continua sendo o da refeição).
// Fonte (sempre lida no SERVIDOR, nunca recebida do frontend):
//   Centro de Custo (MA e PA): FoodEmployee.costCenter do colaborador no momento do lançamento/finalização.
//   Empresa MA: empresa padrão do colaborador no Café da Manhã (BreakfastEmployeeConfig.defaultCompany) no momento;
//               sem configuração → null ("Sem empresa" no rateio).
//   Empresa PA: NÃO gravada — continua DERIVADA da Emissão NF salva na refeição (invoice-company.ts).
// Depois de gravado, mudanças no cadastro não alteram o lançamento. Só uma edição que TROCA o colaborador da refeição
// recaptura o snapshot (é uma correção deliberada, auditada em FoodBatchRevision).
import type { Prisma } from "@/generated/prisma";

export type FoodRateioSnapshot = { costCenter: string | null; companyId: string | null; company: string | null };
type SnapshotCompany = { id: string; legalName: string; tradeName: string | null } | null | undefined;

const collapse = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ") || null;

/** Regra pura (testável): monta o snapshot a partir dos dados do colaborador e da empresa padrão no momento. */
export function buildFoodRateioSnapshot(locality: string, employee: { costCenter: string | null | undefined }, maCompany: SnapshotCompany): FoodRateioSnapshot {
  const company = locality === "MA" && maCompany ? maCompany : null;
  return { costCenter: collapse(employee.costCenter), companyId: company?.id ?? null, company: company ? collapse(company.tradeName) ?? company.legalName.trim() : null };
}

/** Empresas padrão do Café (MA) de vários colaboradores numa única consulta, dentro da transação do lançamento. */
export async function loadFoodSnapshotCompanies(tx: Prisma.TransactionClient, locality: string, employeeIds: ReadonlyArray<string>) {
  const companies = new Map<string, SnapshotCompany>();
  const ids = [...new Set(employeeIds)];
  if (locality !== "MA" || !ids.length) return companies;
  const configs = await tx.breakfastEmployeeConfig.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, defaultCompany: { select: { id: true, legalName: true, tradeName: true } } } });
  for (const config of configs) companies.set(config.employeeId, config.defaultCompany);
  return companies;
}

/** Snapshots prontos por colaborador (lançamento manual: colaboradores já carregados do cadastro no servidor). */
export async function loadFoodRateioSnapshots(tx: Prisma.TransactionClient, locality: string, employees: ReadonlyArray<{ id: string; costCenter: string | null }>) {
  const companies = await loadFoodSnapshotCompanies(tx, locality, employees.map((employee) => employee.id));
  return new Map(employees.map((employee) => [employee.id, buildFoodRateioSnapshot(locality, employee, companies.get(employee.id))]));
}
