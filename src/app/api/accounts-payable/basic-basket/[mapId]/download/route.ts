import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildBasicBasketWorkbook } from "@/modules/accounts-payable/basic-basket/workbook";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response || !user) return response;
  const { mapId } = await context.params;
  const map = await prisma.basicBasketMap.findFirst({ where: { id: mapId, current: true, cancelledAt: null }, include: { competence: true, administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } });
  if (!map) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const generatedBy = (user as { name?: string | null; email?: string | null }).name || (user as { email?: string | null }).email || user.id;
  const buffer = await buildBasicBasketWorkbook(map, generatedBy).xlsx.writeBuffer();
  const filename = `Cesta_Basica_${map.competence.year}-${String(map.competence.month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}