import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getBreakfastEmployeeConfigs } from "@/modules/accounts-payable/breakfast/manual-server";

export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  return NextResponse.json({ items: await getBreakfastEmployeeConfigs() });
}
