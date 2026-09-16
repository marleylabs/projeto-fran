import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { updateUserAccess, UserAccessError } from "@/lib/db/users";

export const runtime = "nodejs";

export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const { user, response } = await requirePermission(PERMISSIONS.ROLES_MANAGE);
  if (response) return response;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  try {
    const updated = await updateUserAccess({ actorId: user.id, targetUserId: id, name: typeof body?.name === "string" ? body.name : undefined, roleKey: typeof body?.roleKey === "string" ? body.roleKey : undefined, active: typeof body?.active === "boolean" ? body.active : undefined });
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof UserAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/users/[id]">) {
  const { user, response } = await requirePermission(PERMISSIONS.USERS_DELETE);
  if (response) return response;

  const { id } = await ctx.params;
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode remover seu próprio usuário." }, { status: 400 });
  }

  return NextResponse.json({ error: "A exclusão de usuários foi desativada. Inative o acesso para preservar a auditoria." }, { status: 405 });
}
