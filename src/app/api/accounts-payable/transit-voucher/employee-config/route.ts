import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getTransitVoucherEmployeeConfigs } from "@/modules/accounts-payable/transit-voucher/manual-server";

export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  return NextResponse.json({ items: await getTransitVoucherEmployeeConfigs() });
}
