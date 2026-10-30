// /api/financial-files/[fileId] — download/visualização do arquivo original de um documento financeiro,
// lido do armazenamento privado (modules/documents/server/privateStorage), nunca servido de pasta pública.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { readPrivateFile } from "@/modules/documents/server/privateStorage";

export const runtime = "nodejs";
/**
 * GET: devolve os bytes com Content-Disposition inline. Permissão: FINANCIAL_RECORDS_READ — 401 sem sessão, 403 sem permissão.
 * Erros: 404 registro inexistente ou conteúdo ausente no storage.
 * Segurança: nome sanitizado contra quebra de cabeçalho, nosniff e cache privado/no-store.
 */
export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const { fileId } = await context.params;
  const file = await prisma.financialDocumentFile.findUnique({ where: { id: fileId } });
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const bytes = await readPrivateFile(file.storageKey).catch(() => null);
  if (!bytes) return NextResponse.json({ error: "Conteúdo indisponível." }, { status: 404 });
  const safeName = file.originalName.replace(/["\r\n]/g, "_");
  return new Response(bytes, { headers: { "Content-Type": file.mimeType, "Content-Length": String(bytes.length), "Content-Disposition": `inline; filename="${safeName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
