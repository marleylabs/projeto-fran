import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TransitVoucherCalculationError } from "@/modules/accounts-payable/transit-voucher/calculations";
import { correctTransitVoucherEntry, type TransitVoucherEntryInput } from "@/modules/accounts-payable/transit-voucher/manual-server";
import { TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

export async function PATCH(request: Request, context: { params: Promise<{ mapId: string; allocationId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { mapId, allocationId } = await context.params;
  try {
    const body = (await request.json().catch(() => null)) as { entry?: TransitVoucherEntryInput; reason?: string } | null;
    if (!body?.entry) throw new TransitVoucherValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await correctTransitVoucherEntry({ mapId, allocationId, entry: body.entry, reason: body.reason ?? "", userId: user.id }));
  } catch (error) {
    if (error instanceof TransitVoucherValidationError || error instanceof TransitVoucherCalculationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
