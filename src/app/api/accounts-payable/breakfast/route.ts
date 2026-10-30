// GET /api/accounts-payable/breakfast?year=&month= — competência do Café da Manhã com os lançamentos vigentes.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBreakfastCompetence, BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";

/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: { competence }.
 * Erros: 400 BreakfastValidationError.
 */
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json({ competence: await getBreakfastCompetence(Number(params.get("year")), Number(params.get("month"))) }); }
  catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
