import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingExpenseValidationError, parseCancelTrainingExpenseInput } from "@/modules/accounts-payable/training-expense/schema";
import { cancelTrainingExpense } from "@/modules/accounts-payable/training-expense/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { id } = await context.params;
  try {
    const data = parseCancelTrainingExpenseInput(await request.json().catch(() => null));
    const item = await cancelTrainingExpense(id, data.reason, user.id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof TrainingExpenseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
