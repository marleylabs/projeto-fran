// /api/accounts-payable/breakfast/holidays — feriados extras da competência do Café da Manhã (reduzem dias úteis).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { removeBreakfastHoliday, saveBreakfastHoliday } from "@/modules/accounts-payable/breakfast/manual-server";
import { BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";

/**
 * POST — inclui feriado. Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { year, month, date, name } (validados em saveBreakfastHoliday). Erros: 400 BreakfastValidationError.
 */
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; date?: unknown; name?: unknown } | null;
    if (!body) throw new BreakfastValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await saveBreakfastHoliday({ year: Number(body.year), month: Number(body.month), date: body.date, name: body.name, userId: user.id }));
  } catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}

/**
 * DELETE — remove feriado. Mesma permissão do POST. Entrada (JSON): { year, month, date }.
 * Erros: 400 BreakfastValidationError.
 */
export async function DELETE(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; date?: unknown } | null;
    if (!body) throw new BreakfastValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await removeBreakfastHoliday(Number(body.year), Number(body.month), body.date));
  } catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
