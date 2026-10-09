import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingExpenseValidationError, parseCreateTrainingExpenseInput } from "@/modules/accounts-payable/training-expense/schema";
import { createTrainingExpenseDraft, listTrainingExpenses } from "@/modules/accounts-payable/training-expense/server";

export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const year = params.get("year") ? Number(params.get("year")) : undefined;
  const month = params.get("month") ? Number(params.get("month")) : undefined;
  const supplierId = params.get("supplierId") || undefined;
  const trainingId = params.get("trainingId") || undefined;
  const status = (params.get("status") as "DRAFT" | "COMPLETED" | "CANCELLED" | null) || undefined;
  const query = params.get("q") || undefined;
  const items = await listTrainingExpenses({ year, month, supplierId, trainingId, status: status ?? undefined, query });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const data = parseCreateTrainingExpenseInput(await request.json().catch(() => null));
    const item = await createTrainingExpenseDraft({ ...data, userId: user.id });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof TrainingExpenseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
