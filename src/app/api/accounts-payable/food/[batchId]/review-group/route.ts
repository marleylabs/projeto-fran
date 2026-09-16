import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { removeFoodReviewGroup } from "@/modules/accounts-payable/food/ma-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";

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
