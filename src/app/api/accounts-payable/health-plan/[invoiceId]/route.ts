// DELETE /api/accounts-payable/health-plan/[invoiceId] — cancela a fatura (PDF) do Plano de Saúde inteira via
// cancelHealthPlanInvoice (deletion-server): obrigação cancelada e zerada, linhas ficam como histórico.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { AccountsPayableDeletionError, cancelHealthPlanInvoice } from "@/modules/accounts-payable/deletion-server";

/**
 * Permissão: FINANCIAL_RECORDS_DELETE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { confirmation: "EXCLUIR", reason }. Erros: 400 sem confirmação digitada; 409 AccountsPayableDeletionError.
 */
export async function DELETE(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_DELETE);
  if (response || !user) return response;
  const { invoiceId } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string; confirmation?: string } | null;
  if (body?.confirmation !== "EXCLUIR") return NextResponse.json({ error: "Digite EXCLUIR para confirmar." }, { status: 400 });
  try { return NextResponse.json(await cancelHealthPlanInvoice({ invoiceId, reason: body?.reason ?? "", userId: user.id })); }
  catch (error) { if (error instanceof AccountsPayableDeletionError) return NextResponse.json({ error: error.message }, { status: 409 }); throw error; }
}
