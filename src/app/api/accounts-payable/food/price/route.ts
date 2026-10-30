// PATCH /api/accounts-payable/food/price — altera o valor por refeição do fornecedor na competência
// (updateSupplierFoodPrice, food/server). Chamada pela tela de Alimentação.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { FoodBatchValidationError, updateSupplierFoodPrice } from "@/modules/accounts-payable/food/server";

/**
 * Permissão: FINANCIAL_RECORDS_UPDATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { unitPrice, year, month, administrativeEntityId }. Saída: { config }.
 * Erros: 400 corpo inválido ou FoodBatchValidationError.
 */
export async function PATCH(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE); if (response) return response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  try { return NextResponse.json({ config: await updateSupplierFoodPrice(String(body.unitPrice ?? ""), Number(body.year), Number(body.month), String(body.administrativeEntityId ?? "")) }); }
  catch (error) { if (error instanceof FoodBatchValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
