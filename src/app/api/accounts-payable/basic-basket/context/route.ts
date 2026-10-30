// GET /api/accounts-payable/basic-basket/context?year=&month= — contexto de calendário da competência da Cesta.
// Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: JSON de getBasicBasketContext.
// Erros: 400 BasicBasketValidationError (competência inválida).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { BasicBasketValidationError, getBasicBasketContext } from "@/modules/accounts-payable/basic-basket/server";

// Calendário somente leitura: dias no mês, pagamento, feriados (nacionais + VT + Café) e elegibilidade ao Retroativo.
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json(await getBasicBasketContext(Number(params.get("year")), Number(params.get("month")))); }
  catch (error) { if (error instanceof BasicBasketValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}