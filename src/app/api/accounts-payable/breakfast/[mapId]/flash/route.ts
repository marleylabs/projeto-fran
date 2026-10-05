import type ExcelJS from "exceljs";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { BreakfastFlashExportError, buildBreakfastFlashWorkbook } from "@/modules/accounts-payable/breakfast/flash";
export const runtime = "nodejs";
// Máscara Flash: mesma autorização e mesma leitura do lançamento salvo que o download do rateio.
export async function GET(_request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const { mapId } = await context.params;
  const map = await prisma.breakfastMap.findFirst({ where: { id: mapId, current: true, cancelledAt: null }, include: { competence: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" }, include: { companyRef: { select: { taxId: true } } } } } });
  if (!map) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
  let buffer: ExcelJS.Buffer;
  try { buffer = await buildBreakfastFlashWorkbook(map).xlsx.writeBuffer(); }
  catch (error) { if (error instanceof BreakfastFlashExportError) return Response.json({ error: error.message }, { status: 422 }); throw error; }
  const filename = `Mascara_Flash_Cafe_Manha_${map.competence.year}-${String(map.competence.month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
