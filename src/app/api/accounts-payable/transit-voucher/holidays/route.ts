import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { removeTransitVoucherHoliday, saveTransitVoucherHoliday } from "@/modules/accounts-payable/transit-voucher/manual-server";
import { TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; date?: unknown; name?: unknown } | null;
    if (!body) throw new TransitVoucherValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await saveTransitVoucherHoliday({ year: Number(body.year), month: Number(body.month), date: body.date, name: body.name, userId: user.id }));
  } catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}

export async function DELETE(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; date?: unknown } | null;
    if (!body) throw new TransitVoucherValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await removeTransitVoucherHoliday(Number(body.year), Number(body.month), body.date));
  } catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
