import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { removeBreakfastHoliday, saveBreakfastHoliday } from "@/modules/accounts-payable/breakfast/manual-server";
import { BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; date?: unknown; name?: unknown } | null;
    if (!body) throw new BreakfastValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await saveBreakfastHoliday({ year: Number(body.year), month: Number(body.month), date: body.date, name: body.name, userId: user.id }));
  } catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}

export async function DELETE(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; date?: unknown } | null;
    if (!body) throw new BreakfastValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await removeBreakfastHoliday(Number(body.year), Number(body.month), body.date));
  } catch (error) { if (error instanceof BreakfastValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
