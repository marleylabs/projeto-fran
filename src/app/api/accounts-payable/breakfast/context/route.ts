// /api/accounts-payable/breakfast/context — contexto da competência do Café da Manhã (calendário, feriados,
// valor unitário). Funções em breakfast/manual-server.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBreakfastContext, setBreakfastUnitPrice } from "@/modules/accounts-payable/breakfast/manual-server";
import { BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";

/**
 * GET ?year=&month= — Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Saída: JSON de getBreakfastContext. Erros: 400 BreakfastValidationError.
 */
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json(await getBreakfastContext(Number(params.get("year")), Number(params.get("month")))); }
  catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}

/**
 * PUT — define o valor unitário do café na competência. Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { year, month, unitPrice }. Erros: 400 BreakfastValidationError (inclui corpo inválido).
 */
export async function PUT(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; unitPrice?: string | number } | null;
    if (!body) throw new BreakfastValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await setBreakfastUnitPrice(Number(body.year), Number(body.month), body.unitPrice ?? ""));
  } catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
