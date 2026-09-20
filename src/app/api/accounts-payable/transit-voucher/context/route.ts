import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getTransitVoucherContext, setTransitVoucherFare } from "@/modules/accounts-payable/transit-voucher/manual-server";
import { TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json(await getTransitVoucherContext(Number(params.get("year")), Number(params.get("month")))); }
  catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}

export async function PUT(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; fareUnitPrice?: string | number } | null;
    if (!body) throw new TransitVoucherValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await setTransitVoucherFare(Number(body.year), Number(body.month), body.fareUnitPrice ?? ""));
  } catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
