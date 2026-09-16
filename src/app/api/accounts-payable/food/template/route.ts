import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  generateFoodTemplate,
  type FoodTemplateLocality,
} from "@/modules/accounts-payable/food/templates";

export const runtime = "nodejs";

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
