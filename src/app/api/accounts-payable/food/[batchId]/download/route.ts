import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { exportFoodBatch } from "@/modules/accounts-payable/food/export";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const { batchId } = await context.params;
  const batch = await prisma.foodBatch.findFirst({ where: { id: batchId, current: true, cancelledAt: null }, include: { competence: true, administrativeEntity: true, allocations: { orderBy: { sourceRow: "asc" } }, mealOccurrences: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } });
  if (!batch) return Response.json({ error: "Lote não encontrado." }, { status: 404 });
  if (batch.status !== "READY") return Response.json({ error: "Corrija as inconsistências antes de exportar o lote." }, { status: 409 });
  const buffer = await exportFoodBatch(batch); const cycle = batch.locality === "MA" && batch.cycle > 0 ? `_Ciclo_${batch.cycle}` : ""; const filename = `Rateio_Alimentacao_${batch.locality}_${batch.competence.year}-${String(batch.competence.month).padStart(2, "0")}${cycle}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
