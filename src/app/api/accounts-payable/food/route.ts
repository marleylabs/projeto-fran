// GET /api/accounts-payable/food?year=&month= — competência de Alimentação (lotes, preços etc.) via getFoodCompetence.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { FoodBatchValidationError, getFoodCompetence } from "@/modules/accounts-payable/food/server";

/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Erros: 400 FoodBatchValidationError.
 */
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const params = new URL(request.url).searchParams; const year = Number(params.get("year")); const month = Number(params.get("month"));
  try { return NextResponse.json(await getFoodCompetence(year, month)); }
  catch (error) { if (error instanceof FoodBatchValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
