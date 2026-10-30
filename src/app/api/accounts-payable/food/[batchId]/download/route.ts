// GET /api/accounts-payable/food/[batchId]/download — XLSX do rateio de Alimentação de um lote pronto.
// Gerado por exportFoodBatch (food/export).
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { exportFoodBatch } from "@/modules/accounts-payable/food/export";

export const runtime = "nodejs";
/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Saída: arquivo .xlsx como anexo (Content-Disposition).
 * Erros: 404 lote inexistente/não vigente/cancelado; 409 se o lote ainda não está READY (há inconsistências).
 */
export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const { batchId } = await context.params;
  const include = { competence: true, administrativeEntity: true, allocations: { orderBy: { sourceRow: "asc" } }, mealOccurrences: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } as const;
  const batch = await prisma.foodBatch.findFirst({ where: { id: batchId, current: true, cancelledAt: null }, include });
  if (!batch) return Response.json({ error: "Lote não encontrado." }, { status: 404 });
  if (batch.status !== "READY") return Response.json({ error: "Corrija as inconsistências antes de exportar o lote." }, { status: 409 });
  // MA: um único rateio por fornecedor na competência — os lotes prontos dos ciclos saem juntos no mesmo arquivo.
  const batches = batch.locality === "MA"
    ? await prisma.foodBatch.findMany({ where: { competenceId: batch.competenceId, locality: "MA", administrativeEntityId: batch.administrativeEntityId, current: true, status: "READY", cancelledAt: null }, include, orderBy: { cycle: "asc" } })
    : [batch];
  const buffer = await exportFoodBatch({ ...batch, cycles: batches.map((item) => item.cycle), mealOccurrences: batches.flatMap((item) => item.mealOccurrences) });
  const cycle = batches.length === 1 && batch.locality === "MA" && batch.cycle > 0 ? `_Ciclo_${batch.cycle}` : "";
  const filename = `Rateio_Alimentacao_${batch.locality}_${batch.competence.year}-${String(batch.competence.month).padStart(2, "0")}${cycle}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
