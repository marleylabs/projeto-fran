import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { exportFoodConsolidated } from "@/modules/accounts-payable/food/export";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const params = new URL(request.url).searchParams; const year = Number(params.get("year")); const month = Number(params.get("month"));
  const competence = await prisma.foodCompetence.findUnique({ where: { year_month: { year, month } }, include: { batches: { where: { current: true, status: "READY", cancelledAt: null }, include: { competence: true, administrativeEntity: true, allocations: true, mealOccurrences: { where: { deletedAt: null } }, issues: true }, orderBy: { locality: "asc" } } } });
  if (!competence?.batches.length) return Response.json({ error: "Nenhum lote disponível para a competência." }, { status: 404 });
  const buffer = await exportFoodConsolidated(competence.batches); const filename = `Alimentacao_Consolidado_${year}-${String(month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
