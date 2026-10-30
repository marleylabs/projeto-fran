// /api/users — listagem e criação de usuários do sistema (tela src/app/usuarios/page.tsx).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { createUser, listRoles, listUsers } from "@/lib/db/users";
import { passwordResetMailConfigured } from "@/lib/auth/password-reset-mail";
import { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";

/**
 * GET: retorna { users, roles, recoveryEmailConfigured } — o último indica se o SMTP de recuperação está configurado.
 * Permissão: USERS_READ — 401 sem sessão, 403 sem permissão.
 */
export async function GET() {
  const { response } = await requirePermission(PERMISSIONS.USERS_READ);
  if (response) return response;

  const [users, roles] = await Promise.all([listUsers(), listRoles()]);
  return NextResponse.json({ users, roles, recoveryEmailConfigured: passwordResetMailConfigured() });
}

/**
 * POST: corpo JSON { email, password (mín. 8), name?, roleKey? (padrão "REQUESTER") }. Permissão: USERS_CREATE.
 * Retorna { user }. Erros: 400 dados/perfil inválido, 409 e-mail já cadastrado (P2002).
 */
export async function POST(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.USERS_CREATE);
  if (response) return response;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "REQUESTER";

  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: "Email e senha (mínimo 8 caracteres) são obrigatórios." }, { status: 400 });
  }

  try {
    const role = await (await import("@/lib/db/prisma")).prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
    const user = await createUser(email, password, name, roleKey);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Já existe um usuário com esse email." }, { status: 409 });
    }
    throw error;
  }
}
