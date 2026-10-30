// POST /api/accounts-payable/food/manual — lançamento manual de ocorrências de Alimentação (tela de Alimentação).
// Delega a addManualFoodOccurrences (food/manual-server); a UI lê a resposta com parseManualFoodResponse.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addManualFoodOccurrences } from "@/modules/accounts-payable/food/manual-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): payload de manual-contract (competência, fornecedor, colaboradores, datas, quantidades...).
 * Saída: { ok: true, batchId, created, meals, skipped, total, duplicateDetails } — 201 se criou algo, 200 se tudo
 * era duplicado. Erros: 400 { ok: false } para FoodBatchValidationError; 500 { ok: false } para o resto.
 */
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    // userId vem da sessão e é aplicado depois do spread: o corpo não consegue sobrescrevê-lo.
    const result = await addManualFoodOccurrences({ ...await request.json(), userId: user.id });
    return NextResponse.json({
      ok: true,
      batchId: result.batchId,
      created: result.createdCount,
      meals: result.createdMeals,
      skipped: result.duplicateCount,
      total: Number(result.createdTotal),
      duplicateDetails: result.duplicateDetails,
    }, { status: result.createdCount ? 201 : 200 });
  } catch (error) {
    if (error instanceof FoodBatchValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("PA_MANUAL_PERSISTENCE_ERROR", error);
    return NextResponse.json({ ok: false, error: "Não foi possível salvar as ocorrências." }, { status: 500 });
  }
}
