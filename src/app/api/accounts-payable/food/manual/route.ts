import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addManualFoodOccurrences } from "@/modules/accounts-payable/food/manual-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
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
