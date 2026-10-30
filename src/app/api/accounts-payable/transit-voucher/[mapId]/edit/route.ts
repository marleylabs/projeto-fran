// PATCH /api/accounts-payable/transit-voucher/[mapId]/edit — edita linhas (empresa, departamento, nome, valor)
// de um mapa de Vale Transporte via editTransitVoucherMap. Nenhuma tela atual chama esta rota (fluxo de upload).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { editTransitVoucherMap, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { rows } (não-array vira lista vazia). Saída: { map }. Erros: 400 TransitVoucherValidationError;
 * JSON inválido não é tratado e resulta em 500.
 */
export async function PATCH(request: Request, context: { params: Promise<{ mapId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response) return response;
  try { const { mapId } = await context.params; const body = await request.json(); return NextResponse.json({ map: await editTransitVoucherMap(mapId, Array.isArray(body.rows) ? body.rows : []) }); }
  catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
