import { NextResponse } from "next/server";
import { Prisma, ValidationDecision } from "@/generated/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { response } = await requirePermission(PERMISSIONS.DOCUMENT_VALIDATION_READ); if (response) return response;
  const { id } = await context.params;
  const record = await prisma.financialRecord.findUnique({ where: { id }, include: { files: { where: { active: true }, include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }, validationReviews: { include: { reviewer: { select: { id: true, name: true, email: true } }, fields: true }, orderBy: { createdAt: "desc" } } } });
  if (!record) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  const file = record.files.find((entry) => entry.extractions.length > 0) ?? null;
  return NextResponse.json({ record, current: file ? { file: { id: file.id, originalName: file.originalName, mimeType: file.mimeType }, extraction: file.extractions[0] } : null });
}

export async function POST(request: Request, context: Context) {
  const { user, response } = await requirePermission(PERMISSIONS.DOCUMENT_VALIDATION_MANAGE); if (response || !user) return response;
  const { id } = await context.params; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.extractionId !== "string" || typeof body.correctedData !== "object" || !body.correctedData) return NextResponse.json({ error: "Dados de validação inválidos." }, { status: 400 });
  if (typeof body.decision !== "string" || !Object.values(ValidationDecision).includes(body.decision as ValidationDecision)) return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
  const extraction = await prisma.documentExtraction.findFirst({ where: { id: body.extractionId, file: { financialRecordId: id } } });
  if (!extraction) return NextResponse.json({ error: "Extração não encontrada para este registro." }, { status: 404 });
  const decision = body.decision as ValidationDecision; const corrected = body.correctedData as Record<string, unknown>; const confidence = Number(extraction.overallConfidence ?? 0);
  if (decision === "VALIDATED" && confidence < 0.8 && body.lowConfidenceAcknowledged !== true) return NextResponse.json({ error: "Confirme explicitamente os campos de baixa confiança." }, { status: 409 });
  const extracted = (extraction.structuredData && typeof extraction.structuredData === "object" ? extraction.structuredData : {}) as Record<string, unknown>;
  const fieldConfidences = (extraction.fieldConfidences && typeof extraction.fieldConfidences === "object" ? extraction.fieldConfidences : {}) as Record<string, unknown>;
  try {
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.documentValidationReview.create({ data: { financialRecordId: id, extractionId: extraction.id, reviewerUserId: user.id, decision, extractedSnapshot: extracted as Prisma.InputJsonValue, correctedData: corrected as Prisma.InputJsonValue, lowConfidenceAcknowledged: body.lowConfidenceAcknowledged === true, notes: typeof body.notes === "string" ? body.notes.trim() || null : null, fields: { create: Object.keys({ ...extracted, ...corrected }).map((key) => ({ fieldKey: key, extractedValue: (extracted[key] ?? Prisma.JsonNull) as Prisma.InputJsonValue, finalValue: (corrected[key] ?? Prisma.JsonNull) as Prisma.InputJsonValue, confidence: typeof fieldConfidences[key] === "number" ? new Prisma.Decimal(fieldConfidences[key]) : null, changed: JSON.stringify(extracted[key] ?? null) !== JSON.stringify(corrected[key] ?? null) })) } } });
      const recordData: Prisma.FinancialRecordUpdateInput = { validationState: decision === "VALIDATED" ? "VALIDATED" : decision === "REJECTED" ? "REJECTED" : "IN_REVIEW" };
      if (decision === "VALIDATED") {
        if (typeof corrected.documentNumber === "string") recordData.documentNumber = corrected.documentNumber.trim() || null;
        if (typeof corrected.dueDate === "string" && !Number.isNaN(Date.parse(corrected.dueDate))) recordData.dueDate = new Date(corrected.dueDate);
        if (typeof corrected.grossAmount === "string") recordData.grossAmount = new Prisma.Decimal(corrected.grossAmount);
        if (typeof corrected.netAmount === "string") recordData.netAmount = new Prisma.Decimal(corrected.netAmount);
      }
      await tx.financialRecord.update({ where: { id }, data: recordData });
      return created;
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) { if (error instanceof Error && error.message.includes("Decimal")) return NextResponse.json({ error: "Valor monetário inválido." }, { status: 400 }); throw error; }
}
