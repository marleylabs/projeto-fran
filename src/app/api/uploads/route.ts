import { NextResponse } from "next/server";
import { listUploads } from "@/lib/db/uploads";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";

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
