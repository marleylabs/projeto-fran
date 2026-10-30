// /api/users/[id]/password-reset — administrador redefine a senha de outro usuário (tela src/app/usuarios/page.tsx).
// Duas estratégias: senha temporária definida pelo admin, ou link de uso único enviado por e-mail
// (concluído pelo próprio usuário em /api/auth/password-reset). Regras e auditoria em lib/db/users.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { sendPasswordResetMail } from "@/lib/auth/password-reset-mail";
import { createPasswordReset, setTemporaryPassword, UserAccessError } from "@/lib/db/users";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/**
 * POST: corpo JSON { strategy?: "temporary", password?, confirmation? }. Permissão: ROLES_MANAGE — 401 sem sessão, 403 sem permissão.
 * Sem strategy "temporary", gera token e envia e-mail. Retorna { ok, strategy, expiresAt? }.
 * Erros: UserAccessError com seu status (ex.: 404 usuário, 409 inativo, 400 senha); 503 falha no envio do e-mail.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.ROLES_MANAGE);
  if (response) return response;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  try {
    if (body?.strategy === "temporary") {
      const password = typeof body?.password === "string" ? body.password : "";
      const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
      if (password !== confirmation) throw new UserAccessError("A confirmação da senha não confere.");
      await setTemporaryPassword(user.id, id, password);
      return NextResponse.json({ ok: true, strategy: "temporary" });
    }
    const reset = await createPasswordReset(user.id, id);
    try {
      await sendPasswordResetMail({ email: reset.user.email, name: reset.user.name, token: reset.token });
      await prisma.userAccessAudit.create({ data: { actorId: user.id, targetUserId: id, action: "PASSWORD_RESET_SENT" } });
    }
    catch (error) {
      // Se o e-mail não sai, apaga o token recém-criado para não deixar um link válido que ninguém recebeu.
      await prisma.passwordResetToken.delete({ where: { id: reset.user.resetTokenId } }).catch(() => undefined);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível enviar o e-mail de redefinição." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, strategy: "email", expiresAt: reset.expiresAt });
  } catch (error) {
    if (error instanceof UserAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
