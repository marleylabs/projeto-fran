import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addTransitVoucherEntries, type TransitVoucherEntryInput } from "@/modules/accounts-payable/transit-voucher/manual-server";
import { TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";
import { TransitVoucherCalculationError } from "@/modules/accounts-payable/transit-voucher/calculations";

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; administrativeEntityId?: string; entries?: TransitVoucherEntryInput[] } | null;
    if (!body || typeof body.administrativeEntityId !== "string") throw new TransitVoucherValidationError("Cadastro da obrigação é obrigatório.");
    return NextResponse.json(await addTransitVoucherEntries({ year: Number(body.year), month: Number(body.month), administrativeEntityId: body.administrativeEntityId, entries: body.entries ?? [], userId: user.id }), { status: 201 });
  } catch (error) {
    if (error instanceof TransitVoucherValidationError || error instanceof TransitVoucherCalculationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
