// GET /api/accounts-payable/basic-basket/employee-config — padrões atuais por colaborador (empresa + valores)
// usados para pré-preencher o lançamento da Cesta Básica.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBasicBasketEmployeeConfigs } from "@/modules/accounts-payable/basic-basket/server";

/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: { items } de getBasicBasketEmployeeConfigs.
 */
export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  return NextResponse.json({ items: await getBasicBasketEmployeeConfigs() });
}