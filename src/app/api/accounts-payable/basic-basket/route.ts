import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { BasicBasketValidationError, getBasicBasketCompetence } from "@/modules/accounts-payable/basic-basket/server";

// Lançamentos vigentes da competência (abas Rateio/Resumo).
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json({ competence: await getBasicBasketCompetence(Number(params.get("year")), Number(params.get("month"))) }); }
  catch (error) { if (error instanceof BasicBasketValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}