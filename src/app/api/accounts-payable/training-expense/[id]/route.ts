import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingExpenseValidationError, parseUpdateTrainingExpenseInput } from "@/modules/accounts-payable/training-expense/schema";
import { editCompletedTrainingExpense, getTrainingExpenseDetail, updateTrainingExpenseDraft } from "@/modules/accounts-payable/training-expense/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const { id } = await context.params;
  const item = await getTrainingExpenseDetail(id);
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { id } = await context.params;
  try {
    const data = parseUpdateTrainingExpenseInput(await request.json().catch(() => null));
    const current = await getTrainingExpenseDetail(id);
    if (!current) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    const item = current.status === "COMPLETED"
      ? await editCompletedTrainingExpense(id, data, user.id)
      : await updateTrainingExpenseDraft(id, data);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof TrainingExpenseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
