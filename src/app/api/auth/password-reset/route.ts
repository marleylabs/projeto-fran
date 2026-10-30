// /api/auth/password-reset — conclusão da redefinição de senha pelo link enviado por e-mail
// (tela src/app/redefinir-senha/page.tsx). O link é gerado por /api/users/[id]/password-reset.
import { NextResponse } from "next/server";
import { consumePasswordReset, UserAccessError } from "@/lib/db/users";

export const runtime = "nodejs";

/**
 * POST: corpo JSON { token, password, confirmation }. Rota pública: o token de uso único é a credencial.
 * consumePasswordReset valida token (hash, expiração, uso), tamanho mínimo da senha e grava o novo hash.
 * Retorna { ok: true }. Erros: 400 token ausente/confirmação divergente; UserAccessError com seu status.
 */
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
