import { NextResponse } from "next/server";
import { getUploadById } from "@/lib/db/uploads";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { response: authResponse } = await requireUser();
  if (authResponse) return authResponse;

  const { id } = await ctx.params;

  try {
    const upload = await getUploadById(id);
    if (!upload) {
      return NextResponse.json({ error: "Upload não encontrado." }, { status: 404 });
    }
    const data = upload.data as Record<string, unknown>;
    return NextResponse.json({ ...data, id: upload.id });
  } catch (error) {
    console.error("Falha ao buscar upload:", error);
    return NextResponse.json({ error: "Não foi possível carregar este upload." }, { status: 500 });
  }
}
