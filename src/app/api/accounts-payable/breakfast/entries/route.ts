// POST /api/accounts-payable/breakfast/entries — grava o lançamento do Café da Manhã da competência
// (alocações + obrigação financeira) via addBreakfastEntries; quantidades e valores são calculados no servidor.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addBreakfastEntries, type BreakfastEntryInput } from "@/modules/accounts-payable/breakfast/manual-server";
import { BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";
import { BreakfastCalculationError } from "@/modules/accounts-payable/breakfast/calculations";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { year, month, administrativeEntityId (obrigatório), entries: BreakfastEntryInput[] }.
 * Saída: 201 com o resultado. Erros: 400 BreakfastValidationError/BreakfastCalculationError.
 */
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; administrativeEntityId?: string; entries?: BreakfastEntryInput[] } | null;
    if (!body || typeof body.administrativeEntityId !== "string") throw new BreakfastValidationError("Cadastro da obrigação é obrigatório.");
    return NextResponse.json(await addBreakfastEntries({ year: Number(body.year), month: Number(body.month), administrativeEntityId: body.administrativeEntityId, entries: body.entries ?? [], userId: user.id }), { status: 201 });
  } catch (error) {
    if (error instanceof BreakfastValidationError || error instanceof BreakfastCalculationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
