// GET /api/accounts-payable/health-plan/[invoiceId]/download — XLSX do rateio do Plano de Saúde.
// Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: arquivo .xlsx como anexo (Content-Disposition).
// Erros: 404 se a fatura não existe (ou não há fatura ativa do fornecedor).
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getHealthPlanSupplierInvoices } from "@/modules/accounts-payable/health-plan/server";
import { buildHealthPlanWorkbook } from "@/modules/accounts-payable/health-plan/workbook";

export const runtime = "nodejs";
// Um único rateio por fornecedor na competência: as faturas ativas do fornecedor saem no mesmo XLSX.
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const { invoiceId } = await context.params;
  const invoices = await getHealthPlanSupplierInvoices(invoiceId);
  if (!invoices?.length) return Response.json({ error: "Fatura não encontrada." }, { status: 404 });
  const buffer = await buildHealthPlanWorkbook(invoices).xlsx.writeBuffer();
  const { year, month } = invoices[0].competence;
  const filename = `Plano_Saude_${year}-${String(month).padStart(2, "0")}.xlsx`;
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
