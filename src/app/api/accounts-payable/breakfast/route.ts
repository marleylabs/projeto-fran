import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBreakfastCompetence, BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";

export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json({ competence: await getBreakfastCompetence(Number(params.get("year")), Number(params.get("month"))) }); }
  catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
