import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getTrainingExpenseSummary } from "@/modules/accounts-payable/training-expense/server";

export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const year = params.get("year") ? Number(params.get("year")) : undefined;
  const month = params.get("month") ? Number(params.get("month")) : undefined;
  const result = await getTrainingExpenseSummary({ year, month });
  return NextResponse.json(result);
}
