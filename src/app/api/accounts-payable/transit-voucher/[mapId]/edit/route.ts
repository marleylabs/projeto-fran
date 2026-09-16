import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { editTransitVoucherMap, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

export async function PATCH(request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response) return response;
  try { const { mapId } = await context.params; const body = await request.json(); return NextResponse.json({ map: await editTransitVoucherMap(mapId, Array.isArray(body.rows) ? body.rows : []) }); }
  catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
