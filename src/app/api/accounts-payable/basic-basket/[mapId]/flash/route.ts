import type ExcelJS from "exceljs";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { FlashExportError, buildFlashWorkbook } from "@/modules/accounts-payable/shared/flash";
export const runtime = "nodejs";
// Máscara Flash da Cesta Básica: mesma especificação, autorização e leitura do lançamento salvo que o Café da Manhã
// (e o download do rateio da Cesta). FLEXIVEL = Total PERSISTIDO de cada alocação (Bonificação + Acordo + Cesta paga +
// Retroativo, já com admissão/Retroativo/Férias/Falta aplicados pelo servidor) — o exportador não recalcula nada.
export async function GET(_request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const { mapId } = await context.params;
  const map = await prisma.basicBasketMap.findFirst({ where: { id: mapId, current: true, cancelledAt: null }, include: { competence: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" }, include: { companyRef: { select: { taxId: true } }, employee: { select: { cpf: true } } } } } });
  if (!map) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
  let buffer: ExcelJS.Buffer;
  try { buffer = await buildFlashWorkbook(map).xlsx.writeBuffer(); }
  catch (error) { if (error instanceof FlashExportError) return Response.json({ error: error.message }, { status: 422 }); throw error; }
  const filename = `Mascara_Flash_Cesta_Basica_${map.competence.year}-${String(map.competence.month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
