// /api/auth/login — autenticação por e-mail e senha (tela src/app/login/page.tsx).
// Cria a sessão (cookie httpOnly) via lib/auth/session e registra lastLoginAt.
import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST: corpo JSON { email, password }. Rota pública (não exige sessão).
 * Retorna { ok, user: { id, email, name } } e define o cookie de sessão.
 * Erros: 400 campos vazios; 401 credenciais inválidas (mensagem única para usuário inexistente ou senha errada,
 * para não revelar quais e-mails existem); 403 usuário inativo — checado só após validar a senha.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    return NextResponse.json({ error: "Email ou senha inválidos." }, { status: 401 });
  }

  if (!user.active) return NextResponse.json({ error: "Este acesso está inativo. Procure um administrador." }, { status: 403 });

  await createSession(user.id);
  await (await import("@/lib/db/prisma")).prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
