// POST /api/accounts-payable/basic-basket/entries — grava o lançamento da Cesta Básica da competência
// (alocações + obrigação financeira) via addBasicBasketEntries (módulo basic-basket/server).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addBasicBasketEntries, BasicBasketValidationError, type BasicBasketEntryInput } from "@/modules/accounts-payable/basic-basket/server";

/**
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { year, month, administrativeEntityId (fornecedor, obrigatório), entries, pointMirrorImportId?,
 * pointMirrorReview?: { approvedIds, rejectedIds } }. Saída: 201 com o resultado do salvamento.
 * Erros: 400 BasicBasketValidationError. O cliente só envia ids da importação do Espelho de Ponto e as decisões
 * da revisão; o servidor relê a importação e recalcula dias e valores (nada calculado vem do cliente).
 */
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