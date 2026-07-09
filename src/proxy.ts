import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

const PUBLIC_ROUTES = ["/login"];
const COOKIE_NAME = "session";

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const sessionId = req.cookies.get(COOKIE_NAME)?.value;
  if (!sessionId) return false;

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  return !!session && session.expiresAt > new Date();
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.includes(path);
  const authenticated = await isAuthenticated(req);

  if (!isPublicRoute && !authenticated) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && authenticated) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

// Roda em todas as páginas, exceto rotas de API (cada uma se protege sozinha
// com requireUser(), já que redirecionar uma chamada fetch() quebraria o JSON
// esperado) e assets estáticos.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
