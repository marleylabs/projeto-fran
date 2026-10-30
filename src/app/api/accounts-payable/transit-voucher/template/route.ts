// GET /api/accounts-payable/transit-voucher/template — máscara XLSX em branco do Vale Transporte.
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { generateTransitVoucherTemplate } from "@/modules/accounts-payable/transit-voucher/templates";

export const runtime = "nodejs";
/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: arquivo .xlsx como anexo (Content-Disposition). Sem cache.
 */
export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const buffer = await generateTransitVoucherTemplate();
  return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Mascara_Vale_Transporte.xlsx"', "Cache-Control": "private, no-store" } });
}
