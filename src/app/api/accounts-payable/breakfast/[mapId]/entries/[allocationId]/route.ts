// PATCH /api/accounts-payable/breakfast/[mapId]/entries/[allocationId] — correção de uma linha de lançamento
// do Café da Manhã já salvo, via correctBreakfastEntry (cancelamento lógico do original + novo registro,
// preservando os snapshots do original).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { BreakfastCalculationError } from "@/modules/accounts-payable/breakfast/calculations";
import { correctBreakfastEntry, type BreakfastEntryInput } from "@/modules/accounts-payable/breakfast/manual-server";
import { BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";

/**
 * Permissão: FINANCIAL_RECORDS_UPDATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { entry: BreakfastEntryInput, reason?: string }. Saída: JSON do resultado da correção.
 * Erros: 400 corpo inválido, BreakfastValidationError ou BreakfastCalculationError; demais sobem (500).
 */
export async function PATCH(request: Request, context: { params: Promise<{ mapId: string; allocationId: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { mapId, allocationId } = await context.params;
  try {
    const body = (await request.json().catch(() => null)) as { entry?: BreakfastEntryInput; reason?: string } | null;
    if (!body?.entry) throw new BreakfastValidationError("Corpo da requisição inválido.");
    return NextResponse.json(await correctBreakfastEntry({ mapId, allocationId, entry: body.entry, reason: body.reason ?? "", userId: user.id }));
  } catch (error) {
    if (error instanceof BreakfastValidationError || error instanceof BreakfastCalculationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
