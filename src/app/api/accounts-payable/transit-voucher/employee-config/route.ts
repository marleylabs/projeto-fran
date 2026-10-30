// GET /api/accounts-payable/transit-voucher/employee-config — configuração atual por colaborador do Vale
// Transporte, usada para pré-preencher o lançamento.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getTransitVoucherEmployeeConfigs } from "@/modules/accounts-payable/transit-voucher/manual-server";

/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: { items }.
 */
export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  return NextResponse.json({ items: await getTransitVoucherEmployeeConfigs() });
}
