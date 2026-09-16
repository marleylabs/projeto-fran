import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE); if (response) return response;
  const { fileId } = await context.params;
  const file = await prisma.financialDocumentFile.findUnique({ where: { id: fileId }, select: { id: true, financialRecordId: true } });
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.documentExtractionJob.create({ data: { fileId } });
    await tx.financialRecord.update({ where: { id: file.financialRecordId }, data: { extractionState: "QUEUED", validationState: "PENDING" } });
    return created;
  });
  return NextResponse.json({ job }, { status: 202 });
}
