import "server-only";
// Leitura do Café da Manhã e erro de validação compartilhado. A escrita (contexto, feriados, lançamentos, correção)
// fica em manual-server.ts; o Espelho de Ponto em point-mirror-server.ts.
import { prisma } from "@/lib/db/prisma";

/** Erro de negócio com mensagem pronta para o usuário; as rotas respondem HTTP 400 com ela. */
export class BreakfastValidationError extends Error {}

function validateCompetence(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new BreakfastValidationError("Competência inválida.");
}

// Leitura dos mapas vigentes da competência (para as abas Rateio/Resumo) — mesmo padrão de getTransitVoucherCompetence.
export async function getBreakfastCompetence(year: number, month: number) {
  validateCompetence(year, month);
  return prisma.breakfastCompetence.findUnique({
    where: { year_month: { year, month } },
    include: { maps: { where: { current: true, cancelledAt: null }, include: { administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } } },
  });
}
