import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { generateTransitVoucherTemplate } from "@/modules/accounts-payable/transit-voucher/templates";

export const runtime = "nodejs";
export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const buffer = await generateTransitVoucherTemplate();
  return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Mascara_Vale_Transporte.xlsx"', "Cache-Control": "private, no-store" } });
}
