import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Sessão baseada em banco: o cookie httpOnly "session" guarda só o id da linha `Session`; usuário,
// perfis e permissões são relidos do banco a cada requisição. Por isso desativar um usuário ou apagar
// suas sessões (ver src/lib/db/users.ts) derruba o acesso imediatamente. Usado pelas rotas
// /api/auth/* (login/logout/me), por requirePermission (./permissions) e por src/proxy.ts.
const COOKIE_NAME = "session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O cookie "Secure" só é enviado pelo navegador em HTTPS. Por padrão isso é
 * exigido em produção — mas um deploy acessado só por IP:porta HTTP (sem proxy
 * reverso/TLS na frente) precisa desligar isso explicitamente com
 * SECURE_COOKIES=false, senão o login nunca vai persistir a sessão.
 */
function resolveSecureCookieFlag(): boolean {
  if (process.env.SECURE_COOKIES === "false") return false;
  if (process.env.SECURE_COOKIES === "true") return true;
  return process.env.NODE_ENV === "production";
}

/** Cria a linha `Session` (validade de 7 dias) e grava o cookie. Chamado pelo login após validar a senha. */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await prisma.session.create({ data: { userId, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: resolveSecureCookieFlag(),
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Usuário da sessão atual (verificada no banco), ou null se não houver sessão válida. */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  // Sessão expirada ou usuário desativado = sem login (a linha expirada não é apagada aqui).
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  return session.user;
}

/** Logout: apaga a sessão no banco (ignora se já não existir) e remove o cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;

  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }
  cookieStore.delete(COOKIE_NAME);
}

type RequireUserResult =
  | { user: Awaited<ReturnType<typeof getSessionUser>> & object; response: null }
  | { user: null; response: NextResponse };

// Só exige sessão válida; para checar permissão específica use `requirePermission` (./permissions). 401 se não houver sessão.
/** Usado no início de toda rota de API que precisa de login. */
export async function requireUser(): Promise<RequireUserResult> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  return { user, response: null };
}
