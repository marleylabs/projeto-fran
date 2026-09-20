import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingExpenseValidationError } from "@/modules/accounts-payable/training-expense/schema";
import { completeTrainingExpense } from "@/modules/accounts-payable/training-expense/server";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { id } = await context.params;
  try {
    const item = await completeTrainingExpense(id, user.id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof TrainingExpenseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
