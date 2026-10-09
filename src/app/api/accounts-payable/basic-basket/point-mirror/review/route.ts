import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { BasicBasketValidationError, reviewBasicBasketPointMirror } from "@/modules/accounts-payable/basic-basket/server";

export const runtime = "nodejs";
// "Aplicar ajustes aprovados" do Espelho de Ponto da Cesta (Fase 7E.3): o cliente envia só ids aprovados/rejeitados e as
// Férias manuais (para saber o que ainda exige decisão). O servidor relê a importação (mesmo usuário/competência),
// valida tudo e devolve os ajustes calculados com as datas aprovadas. Nada é gravado; o salvamento revalida.
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { importId?: unknown; year?: unknown; month?: unknown; employeeIds?: unknown; approvedIds?: unknown; rejectedIds?: unknown; manualVacationDays?: unknown } | null;
    if (!body || typeof body.importId !== "string" || !body.importId) throw new BasicBasketValidationError("Importação do Espelho de Ponto não informada.");
    return NextResponse.json(await reviewBasicBasketPointMirror({ importId: body.importId, year: Number(body.year), month: Number(body.month), userId: user.id, employeeIds: body.employeeIds, review: { approvedIds: body.approvedIds, rejectedIds: body.rejectedIds }, manualVacationDays: body.manualVacationDays }));
  } catch (error) {
    if (error instanceof BasicBasketValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
