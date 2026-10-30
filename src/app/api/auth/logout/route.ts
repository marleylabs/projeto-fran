// /api/auth/logout — encerra a sessão atual (botão de sair do AppShell).
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";

/** POST: remove a sessão do banco e o cookie. Sem corpo; sempre retorna { ok: true }. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
