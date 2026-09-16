import { NextResponse } from "next/server";
import { consumePasswordReset, UserAccessError } from "@/lib/db/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
  if (!token) return NextResponse.json({ error: "Link de redefinição inválido." }, { status: 400 });
  if (password !== confirmation) return NextResponse.json({ error: "A confirmação da senha não confere." }, { status: 400 });
  try { await consumePasswordReset(token, password); return NextResponse.json({ ok: true }); }
  catch (error) {
    if (error instanceof UserAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
