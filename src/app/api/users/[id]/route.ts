import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteUser } from "@/lib/db/users";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/users/[id]">) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode remover seu próprio usuário." }, { status: 400 });
  }

  await deleteUser(id).catch(() => null);
  return NextResponse.json({ ok: true });
}
