import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { listTrainingProposalsBySupplier } from "@/modules/trainings/server";

export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_READ);
  if (response) return response;
  const supplierId = request.nextUrl.searchParams.get("supplierId");
  if (!supplierId) return NextResponse.json({ error: "Informe o fornecedor." }, { status: 400 });
  const items = await listTrainingProposalsBySupplier(supplierId);
  return NextResponse.json({ items });
}
