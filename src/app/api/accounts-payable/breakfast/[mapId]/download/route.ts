import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { exportBreakfastMap } from "@/modules/accounts-payable/breakfast/export";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const { mapId } = await context.params;
  const map = await prisma.breakfastMap.findFirst({ where: { id: mapId, current: true, cancelledAt: null }, include: { competence: true, administrativeEntity: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } });
  if (!map) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const buffer = await exportBreakfastMap(map);
  const filename = `Cafe_Manha_${map.competence.year}-${String(map.competence.month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
