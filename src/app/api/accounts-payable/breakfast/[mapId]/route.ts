// DELETE /api/accounts-payable/breakfast/[mapId] — exclusão (soft cancel) do lançamento do Café da Manhã.
// Delega a cancelBreakfastMap (deletion-server): linhas marcadas como excluídas, obrigação cancelada; nada é apagado.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { AccountsPayableDeletionError, cancelBreakfastMap } from "@/modules/accounts-payable/deletion-server";

/**
 * Permissão: FINANCIAL_RECORDS_DELETE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { confirmation: "EXCLUIR", reason: string }.
 * Erros: 400 sem a confirmação digitada; 409 AccountsPayableDeletionError.
 */
export async function DELETE(request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_DELETE);
  if (response || !user) return response;
  const { mapId } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string; confirmation?: string } | null;
  if (body?.confirmation !== "EXCLUIR") return NextResponse.json({ error: "Digite EXCLUIR para confirmar." }, { status: 400 });
  try { return NextResponse.json(await cancelBreakfastMap({ mapId, reason: body?.reason ?? "", userId: user.id })); }
  catch (error) { if (error instanceof AccountsPayableDeletionError) return NextResponse.json({ error: error.message }, { status: 409 }); throw error; }
}
