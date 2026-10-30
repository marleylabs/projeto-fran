// /api/auth/me — dados do usuário logado, usados pelo AppShell/navegação e pelas telas para
// mostrar/ocultar ações conforme papéis e permissões. A autorização real continua nos route handlers.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { permissionKeysOf, roleKeysOf } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/** GET: retorna { id, email, name, roles, permissions } do usuário da sessão; 401 se não autenticado. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    roles: roleKeysOf(user),
    permissions: permissionKeysOf(user),
  });
}
