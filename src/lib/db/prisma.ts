import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

// Evita recriar conexões a cada hot-reload em desenvolvimento (recomendação padrão do Prisma com Next.js).
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  // CPF é dado pessoal: omitido de toda consulta por padrão para não vazar em APIs que devolvem a
  // linha inteira do colaborador (listas, Alimentação, Treinamentos...). Quem precisa seleciona
  // explicitamente (`select: { cpf: true }` / `omit: { cpf: false }`).
  return new PrismaClient({ adapter, omit: { foodEmployee: { cpf: true } } });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
