// GET /api/accounts-payable/basic-basket/[mapId]/download — XLSX do rateio da Cesta Básica de um lançamento salvo.
// Chamada pelos botões de download da tela de Cesta Básica (BasicBasketSection/BasicBasketAllocationView);
// a planilha é montada por buildBasicBasketWorkbook a partir do que está gravado (nada é recalculado aqui).
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildBasicBasketWorkbook } from "@/modules/accounts-payable/basic-basket/workbook";
export const runtime = "nodejs";
/**
 * Baixa o rateio do mapa `mapId`. Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Saída: arquivo .xlsx como anexo (Content-Disposition).
 * Erros: 404 se o mapa não existe, não é a versão vigente (current) ou foi cancelado.
 * Só entram alocações não excluídas (deletedAt null), na ordem da linha de origem.
 */
export async function GET(_request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response || !user) return response;
  const { mapId } = await context.params;
  const map = await prisma.basicBasketMap.findFirst({ where: { id: mapId, current: true, cancelledAt: null }, include: { competence: true, administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } } } });
  if (!map) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
  // Autor da geração repassado à planilha: nome, senão e-mail, senão id do usuário.
  const generatedBy = (user as { name?: string | null; email?: string | null }).name || (user as { email?: string | null }).email || user.id;
  const buffer = await buildBasicBasketWorkbook(map, generatedBy).xlsx.writeBuffer();
  const filename = `Cesta_Basica_${map.competence.year}-${String(map.competence.month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}