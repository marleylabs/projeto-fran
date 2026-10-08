import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addBasicBasketEntries, BasicBasketValidationError, type BasicBasketEntryInput } from "@/modules/accounts-payable/basic-basket/server";

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; administrativeEntityId?: string; entries?: BasicBasketEntryInput[]; pointMirrorImportId?: unknown; pointMirrorReview?: { approvedIds?: unknown; rejectedIds?: unknown } | null } | null;
    if (!body || typeof body.administrativeEntityId !== "string" || !body.administrativeEntityId) throw new BasicBasketValidationError("Selecione o fornecedor.");
    return NextResponse.json(await addBasicBasketEntries({ year: Number(body.year), month: Number(body.month), administrativeEntityId: body.administrativeEntityId, entries: body.entries ?? [], userId: user.id, pointMirrorImportId: typeof body.pointMirrorImportId === "string" && body.pointMirrorImportId ? body.pointMirrorImportId : null, pointMirrorReview: body.pointMirrorReview ? { approvedIds: body.pointMirrorReview.approvedIds, rejectedIds: body.pointMirrorReview.rejectedIds } : null }), { status: 201 });
  } catch (error) {
    if (error instanceof BasicBasketValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}