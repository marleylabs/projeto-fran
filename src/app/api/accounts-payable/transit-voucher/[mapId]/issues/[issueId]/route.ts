import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { resolveTransitVoucherIssue, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

export async function PATCH(request: Request, context: { params: Promise<{ mapId: string; issueId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response || !user) return response;
  try { const { mapId, issueId } = await context.params; const body = await request.json(); return NextResponse.json({ map: await resolveTransitVoucherIssue({ mapId, issueId, userId: user.id, data: body.data }) }); }
  catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
