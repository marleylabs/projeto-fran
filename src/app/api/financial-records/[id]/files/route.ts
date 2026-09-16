import { NextResponse } from "next/server";
import { FinancialFileKind, Prisma } from "@/generated/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { MAX_FINANCIAL_FILE_SIZE, removePrivateFile, sanitizeOriginalName, storePrivateFile, validateFileSignature } from "@/modules/documents/server/privateStorage";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response;
  const { id } = await context.params;
  const items = await prisma.financialDocumentFile.findMany({ where: { financialRecordId: id }, select: { id: true, kind: true, version: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, active: true, createdAt: true, uploadedBy: { select: { id: true, name: true, email: true } }, extractionJobs: { select: { state: true, attempts: true, errorMessage: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 }, extractions: { select: { state: true, engine: true, documentType: true, overallConfidence: true, fieldConfidences: true, structuredData: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ kind: "asc" }, { version: "desc" }] });
  return NextResponse.json({ items });
}

export async function POST(request: Request, context: Context) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE); if (response || !user) return response;
  const { id } = await context.params;
  const form = await request.formData().catch(() => null); const file = form?.get("file"); const rawKind = form?.get("kind");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo multipart/form-data." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FINANCIAL_FILE_SIZE) return NextResponse.json({ error: "O arquivo deve possuir no máximo 30 MB." }, { status: 400 });
  if (typeof rawKind !== "string" || !Object.values(FinancialFileKind).includes(rawKind as FinancialFileKind)) return NextResponse.json({ error: "Tipo documental inválido." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!validateFileSignature(buffer, file.type)) return NextResponse.json({ error: "Tipo ou assinatura do arquivo não permitido." }, { status: 415 });
  const exists = await prisma.financialRecord.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Registro financeiro não encontrado." }, { status: 404 });
  const stored = await storePrivateFile(buffer);
  try {
    const item = await prisma.$transaction(async (tx) => {
      const previous = await tx.financialDocumentFile.findFirst({ where: { financialRecordId: id, kind: rawKind as FinancialFileKind, active: true }, orderBy: { version: "desc" } });
      const version = (previous?.version ?? 0) + 1;
      if (previous) await tx.financialDocumentFile.update({ where: { id: previous.id }, data: { active: false } });
      const created = await tx.financialDocumentFile.create({ data: { financialRecordId: id, uploadedByUserId: user.id, supersedesFileId: previous?.id, kind: rawKind as FinancialFileKind, version, originalName: sanitizeOriginalName(file.name), storageKey: stored.storageKey, mimeType: file.type, sizeBytes: file.size, sha256: stored.sha256 } });
      await tx.documentExtractionJob.create({ data: { fileId: created.id } });
      await tx.financialRecord.update({ where: { id }, data: { documentState: "ATTACHED", extractionState: "QUEUED" } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const duplicate = await prisma.financialDocumentFile.findFirst({ where: { sha256: stored.sha256, id: { not: item.id } }, select: { id: true, financialRecordId: true } });
    return NextResponse.json({ item: { ...item, storageKey: undefined }, duplicateWarning: duplicate ?? null }, { status: 201 });
  } catch (error) { await removePrivateFile(stored.storageKey); throw error; }
}
