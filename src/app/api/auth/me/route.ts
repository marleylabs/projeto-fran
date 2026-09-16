import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { permissionKeysOf, roleKeysOf } from "@/lib/auth/permissions";

export const runtime = "nodejs";

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
