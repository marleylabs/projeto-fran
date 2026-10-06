import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { BasicBasketValidationError, correctBasicBasketEntry, type BasicBasketEntryInput } from "@/modules/accounts-payable/basic-basket/server";

export async function PATCH(request: Request, context: { params: Promise<{ mapId: string; allocationId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { mapId, allocationId } = await context.params;
  try {
    const body = (await request.json().catch(() => null)) as { entry?: BasicBasketEntryInput; reason?: string } | null;
    if (!body?.entry) throw new BasicBasketValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await correctBasicBasketEntry({ mapId, allocationId, entry: body.entry, reason: body.reason ?? "", userId: user.id }));
  } catch (error) {
    if (error instanceof BasicBasketValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}