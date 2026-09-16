import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { editFoodMaBatch, type FoodMaEdit } from "@/modules/accounts-payable/food/ma-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";

export async function PATCH(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response || !user) return response;
  const { batchId } = await context.params; const body = await request.json().catch(() => null) as { edits?: FoodMaEdit[] } | null;
  if (!Array.isArray(body?.edits)) return NextResponse.json({ error: "Alterações inválidas." }, { status: 400 });
  try { return NextResponse.json({ batch: await editFoodMaBatch(batchId, user.id, body.edits) }); }
  catch (error) { if (error instanceof FoodBatchValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
