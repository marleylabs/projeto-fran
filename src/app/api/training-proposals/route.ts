// /api/training-proposals — propostas de treinamento de um fornecedor (tela src/app/treinamentos/page.tsx).
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { listTrainingProposalsBySupplier } from "@/modules/trainings/server";

/** GET: query supplierId (obrigatório, 400 se ausente). Permissão: TRAINING_READ — 401 sem sessão, 403 sem permissão. Retorna { items }. */
export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_READ);
  if (response) return response;
  const supplierId = request.nextUrl.searchParams.get("supplierId");
  if (!supplierId) return NextResponse.json({ error: "Informe o fornecedor." }, { status: 400 });
  const items = await listTrainingProposalsBySupplier(supplierId);
  return NextResponse.json({ items });
}
