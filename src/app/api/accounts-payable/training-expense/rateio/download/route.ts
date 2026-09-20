import { NextRequest } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { buildTrainingRateioWorkbook, trainingRateioFilename } from "@/modules/accounts-payable/training-expense/rateio-export";
import { getTrainingExpenseRateio } from "@/modules/accounts-payable/training-expense/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return Response.json({ error: "Competência inválida." }, { status: 400 });
  const supplierId = params.get("supplierId") || undefined;
  const data = await getTrainingExpenseRateio({ year, month, supplierId });
  if (!data.cards.length) return Response.json({ error: "Não há rateio concluído nesta competência." }, { status: 404 });
  const buffer = await buildTrainingRateioWorkbook(data, year, month);
  const filename = trainingRateioFilename(year, month, supplierId ? data.cards[0].supplierName : undefined);
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}
