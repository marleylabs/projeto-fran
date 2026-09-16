import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { FoodBatchValidationError, updateSupplierFoodPrice } from "@/modules/accounts-payable/food/server";

export async function PATCH(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE); if (response) return response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  try { return NextResponse.json({ config: await updateSupplierFoodPrice(String(body.unitPrice ?? ""), Number(body.year), Number(body.month), String(body.administrativeEntityId ?? "")) }); }
  catch (error) { if (error instanceof FoodBatchValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
