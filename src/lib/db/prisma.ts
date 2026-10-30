import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

// Cliente Prisma único da aplicação (Postgres via driver adapter `pg`, DATABASE_URL). Importado por
// todo o backend como `prisma`. Atenção ao `omit` global abaixo: campos pessoais só aparecem quando
// pedidos explicitamente na consulta.

// Evita recriar conexões a cada hot-reload em desenvolvimento (recomendação padrão do Prisma com Next.js).
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  // CPF e Data de Admissão são dados pessoais: omitidos de toda consulta por padrão para não vazar
  // em APIs que devolvem a linha inteira do colaborador (listas, Alimentação, Treinamentos...). Quem
  // precisa seleciona explicitamente (`select: { cpf: true }` / `omit: { cpf: false }`). Plano de Saúde: CPF do titular e
  // linhas dos beneficiários (CPF, nome da mãe, nascimento) seguem a mesma regra.
  return new PrismaClient({ adapter, omit: { foodEmployee: { cpf: true, admissionDate: true }, healthPlanAllocation: { holderCpf: true, beneficiaries: true } } });
}

/** Instância compartilhada do PrismaClient (reaproveitada entre hot-reloads fora de produção). */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
