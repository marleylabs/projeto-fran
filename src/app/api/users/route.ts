import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createUser, listUsers } from "@/lib/db/users";
import { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;

  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: "Email e senha (mínimo 8 caracteres) são obrigatórios." }, { status: 400 });
  }

  try {
    const user = await createUser(email, password, name);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Já existe um usuário com esse email." }, { status: 409 });
    }
    throw error;
  }
}
