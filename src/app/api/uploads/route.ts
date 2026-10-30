// /api/uploads — histórico de uploads de folha (PayrollWorkspace e cards do dashboard).
import { NextResponse } from "next/server";
import { listUploads } from "@/lib/db/uploads";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/** GET: retorna { uploads } (listUploads). Permissão: ACCOUNTING_READ — 401 sem sessão, 403 sem permissão. 500 em falha de banco. */
export async function GET() {
  const { response: authResponse } = await requirePermission(PERMISSIONS.ACCOUNTING_READ);
  if (authResponse) return authResponse;

  try {
    const uploads = await listUploads();
    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("Falha ao listar uploads:", error);
    return NextResponse.json({ error: "Não foi possível carregar o histórico de uploads." }, { status: 500 });
  }
}
