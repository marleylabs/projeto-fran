// PATCH /api/accounts-payable/basic-basket/[mapId]/entries/[allocationId] — correção de uma linha de um
// lançamento da Cesta Básica já salvo. Delega a correctBasicBasketEntry (módulo basic-basket/server), que preserva
// o registro original (cancelamento lógico + novo registro) e recalcula tudo no servidor.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { BasicBasketValidationError, correctBasicBasketEntry, type BasicBasketEntryInput } from "@/modules/accounts-payable/basic-basket/server";

/**
 * Permissão: FINANCIAL_RECORDS_UPDATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { entry: BasicBasketEntryInput, reason?: string }. Saída: JSON com o resultado da correção.
 * Erros: 400 para corpo inválido ou BasicBasketValidationError; demais exceções sobem (500).
 * Só os campos editáveis do `entry` são considerados pelo servidor; valores calculados vêm do snapshot original.
 */
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