import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBasicBasketEmployeeConfigs } from "@/modules/accounts-payable/basic-basket/server";

export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  return NextResponse.json({ items: await getBasicBasketEmployeeConfigs() });
}