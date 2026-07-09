import { NextResponse } from "next/server";
import { listUploads } from "@/lib/db/uploads";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const { response: authResponse } = await requireUser();
  if (authResponse) return authResponse;

  try {
    const uploads = await listUploads();
    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("Falha ao listar uploads:", error);
    return NextResponse.json({ error: "Não foi possível carregar o histórico de uploads." }, { status: 500 });
  }
}
