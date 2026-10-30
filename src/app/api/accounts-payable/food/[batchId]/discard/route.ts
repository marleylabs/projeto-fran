// DELETE /api/accounts-payable/food/[batchId]/discard — "Cancelar importação" na revisão de Alimentação (MA/PA).
// Delega a discardFoodImportReview (food/ma-server): só lote vigente em UNDER_REVIEW; ocorrências marcadas como
// excluídas, lote sai de vigência e o arquivo privado é removido. Não gera nem altera obrigação financeira.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { discardFoodImportReview } from "@/modules/accounts-payable/food/ma-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE (quem importa pode descartar); 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada: batchId na rota. Erros: 409 FoodBatchValidationError (lote não está mais em revisão).
 */
export async function DELETE(_: Request, context: { params: Promise<{ batchId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  const { batchId } = await context.params;
  try {
    return NextResponse.json(await discardFoodImportReview(batchId, user.id));
  } catch (error) {
    if (error instanceof FoodBatchValidationError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
