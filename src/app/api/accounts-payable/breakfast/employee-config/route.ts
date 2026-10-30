// GET /api/accounts-payable/breakfast/employee-config — configuração atual por colaborador do Café da Manhã,
// usada para pré-preencher o lançamento.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBreakfastEmployeeConfigs } from "@/modules/accounts-payable/breakfast/manual-server";

/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: { items } de getBreakfastEmployeeConfigs.
 */
export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  return NextResponse.json({ items: await getBreakfastEmployeeConfigs() });
}
