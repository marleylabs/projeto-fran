// GET /api/accounts-payable/breakfast/[mapId]/download — XLSX do rateio do Café da Manhã de um lançamento salvo.
// Gerado por exportBreakfastMap a partir do que está gravado.
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { exportBreakfastMap } from "@/modules/accounts-payable/breakfast/export";
export const runtime = "nodejs";
/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Saída: arquivo .xlsx como anexo (Content-Disposition).
 * Erros: 404 se o mapa não existe, não é vigente ou foi cancelado. Só alocações não excluídas.
 */
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
