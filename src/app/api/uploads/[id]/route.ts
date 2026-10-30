// /api/uploads/[id] — reabre um upload de folha já processado (histórico da Contabilidade > Folha).
import { NextResponse } from "next/server";
import { getCombinedUploadById } from "@/lib/db/uploads";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/** GET: retorna o upload combinado (getCombinedUploadById). Permissão: ACCOUNTING_READ — 401 sem sessão, 403 sem permissão. 404 inexistente, 500 falha de banco. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { response: authResponse } = await requirePermission(PERMISSIONS.ACCOUNTING_READ);
  if (authResponse) return authResponse;

  const { id } = await ctx.params;

  try {
    const upload = await getCombinedUploadById(id);
    if (!upload) {
      return NextResponse.json({ error: "Upload não encontrado." }, { status: 404 });
    }
    return NextResponse.json(upload);
  } catch (error) {
    console.error("Falha ao buscar upload:", error);
    return NextResponse.json({ error: "Não foi possível carregar este upload." }, { status: 500 });
  }
}
