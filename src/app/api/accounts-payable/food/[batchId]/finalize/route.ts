// POST /api/accounts-payable/food/[batchId]/finalize — conclui a revisão de um lote de Alimentação (FoodMaReview).
// Delega a finalizeFoodMaBatch (food/ma-server) com as resoluções de cada grupo de nome recebido.
// Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission). Entrada (JSON): { resolutions: FoodMaResolution[] }.
// Saída: { batch }. Erros: 400 sem resolutions ou FoodBatchValidationError.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { finalizeFoodMaBatch, type FoodMaResolution } from "@/modules/accounts-payable/food/ma-server";
import { FoodBatchValidationError } from "@/modules/accounts-payable/food/server";
export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) { const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response || !user) return response; const { batchId } = await context.params; const body = await request.json().catch(() => null) as { resolutions?: FoodMaResolution[] } | null; if (!body?.resolutions) return NextResponse.json({ error: "Revisões inválidas." }, { status: 400 }); try { return NextResponse.json({ batch: await finalizeFoodMaBatch(batchId, user.id, body.resolutions) }); } catch (error) { if (error instanceof FoodBatchValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; } }
