// PATCH /api/accounts-payable/transit-voucher/[mapId]/issues/[issueId] — resolve uma inconsistência de linha do
// upload de Vale Transporte com os dados corrigidos (resolveTransitVoucherIssue). Sem chamador na UI atual.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { resolveTransitVoucherIssue, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { data: TransitVoucherRawRow }. Saída: { map }. Erros: 400 TransitVoucherValidationError;
 * JSON inválido resulta em 500.
 */
export async function PATCH(request: Request, context: { params: Promise<{ mapId: string; issueId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response || !user) return response;
  try { const { mapId, issueId } = await context.params; const body = await request.json(); return NextResponse.json({ map: await resolveTransitVoucherIssue({ mapId, issueId, userId: user.id, data: body.data }) }); }
  catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
