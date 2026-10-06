import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { AccountsPayableDeletionError, cancelBasicBasketMap } from "@/modules/accounts-payable/deletion-server";

// Cancelamento (soft cancel) do lançamento inteiro — mesmo fluxo do Café da Manhã.
export async function DELETE(request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_DELETE);
  if (response || !user) return response;
  const { mapId } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string; confirmation?: string } | null;
  if (body?.confirmation !== "EXCLUIR") return NextResponse.json({ error: "Digite EXCLUIR para confirmar." }, { status: 400 });
  try { return NextResponse.json(await cancelBasicBasketMap({ mapId, reason: body?.reason ?? "", userId: user.id })); }
  catch (error) { if (error instanceof AccountsPayableDeletionError) return NextResponse.json({ error: error.message }, { status: 409 }); throw error; }
}