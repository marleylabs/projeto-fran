// DELETE /api/accounts-payable/food/[batchId]/review-group — "Remover da importação" um grupo de nome recebido
// durante a revisão (FoodMaReview). Delega a removeFoodReviewGroup (food/ma-server): exclusão lógica das
// ocorrências do grupo e recálculo dos totais do lote; cadastros de colaboradores não são tocados.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { removeFoodReviewGroup } from "@/modules/accounts-payable/food/ma-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { normalizedReceivedName }. Saída: { removedCount, remainingCount, totalAmount }.
 * Erros: 409 FoodBatchValidationError (lote fora de revisão ou grupo já removido).
 */
export async function DELETE(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  const { batchId } = await context.params;
  const body = await request.json().catch(() => null) as { normalizedReceivedName?: string } | null;
  try {
    return NextResponse.json(await removeFoodReviewGroup(batchId, body?.normalizedReceivedName ?? "", user.id));
  } catch (error) {
    if (error instanceof FoodBatchValidationError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
