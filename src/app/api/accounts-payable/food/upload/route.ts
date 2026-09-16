import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import {
  FOOD_LOCALITIES,
  FoodBatchValidationError,
  processFoodBatch,
  type FoodLocality,
} from "@/modules/accounts-payable/food/server";
import { processFoodMaDraft } from "@/modules/accounts-payable/food/ma-server";
import { processFoodPaDraft } from "@/modules/accounts-payable/food/pa-server";
import { isFoodMaCycle } from "@/modules/accounts-payable/food/cycles";

export const runtime = "nodejs";
function isUploadedFile(
  value: FormDataEntryValue | null | undefined,
): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "size" in value &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}
export async function POST(request: Request) {
  const { user, response } = await requirePermission(
    PERMISSIONS.FINANCIAL_RECORDS_CREATE,
  );
  if (response || !user) return response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const locality = form?.get("locality");
  if (
    !isUploadedFile(file) ||
    typeof locality !== "string" ||
    !FOOD_LOCALITIES.includes(locality as FoodLocality)
  )
    return NextResponse.json(
      { error: "Arquivo ou localidade inválidos." },
      { status: 400 },
    );
  try {
    const common = {
      year: Number(form?.get("year")),
      month: Number(form?.get("month")),
      administrativeEntityId: String(form?.get("administrativeEntityId") ?? ""),
      userId: user.id,
      file,
    };
    const cycle = Number(form?.get("cycle"));
    const batch =
      locality === "MA"
        ? isFoodMaCycle(cycle)
          ? await processFoodMaDraft({ ...common, cycle })
          : (() => { throw new FoodBatchValidationError("Selecione o ciclo de MA."); })()
        : locality === "PA"
          ? await processFoodPaDraft(common)
          : await processFoodBatch({
              ...common,
              locality: locality as FoodLocality,
            });
    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    if (error instanceof FoodBatchValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
