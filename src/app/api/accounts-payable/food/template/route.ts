// GET /api/accounts-payable/food/template?locality=MA|PA — máscara XLSX em branco para importação de Alimentação.
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  generateFoodTemplate,
  type FoodTemplateLocality,
} from "@/modules/accounts-payable/food/templates";

export const runtime = "nodejs";

/**
 * Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Saída: arquivo .xlsx como anexo (Content-Disposition). Sem cache (private, no-store).
 * Erros: 400 se locality não for MA nem PA.
 */
export async function GET(request: Request) {
  const { response } = await requirePermission(
    PERMISSIONS.FINANCIAL_RECORDS_READ,
  );
  if (response) return response;

  const locality = new URL(request.url).searchParams.get("locality");
  if (locality !== "MA" && locality !== "PA") {
    return Response.json(
      { error: "Localidade inválida. Informe MA ou PA." },
      { status: 400 },
    );
  }

  const buffer = await generateFoodTemplate(locality as FoodTemplateLocality);
  const filename = `Mascara_Alimentacao_${locality}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
