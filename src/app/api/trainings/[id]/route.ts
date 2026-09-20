import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingValidationError, parseTrainingUpdateInput } from "@/modules/trainings/schema";
import { getTraining, setTrainingActive, updateTraining } from "@/modules/trainings/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_READ);
  if (response) return response;
  const { id } = await context.params;
  const item = await getTraining(id);
  if (!item) return NextResponse.json({ error: "Treinamento não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_MANAGE);
  if (response) return response;
  const { id } = await context.params;
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body === "object" && ("supplierId" in body || "proposalId" in body)) {
      return NextResponse.json({ error: "Fornecedor e proposta não podem ser alterados diretamente pelo treinamento." }, { status: 400 });
    }
    if (body && typeof body === "object" && "active" in body && Object.keys(body).length === 1) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "Situação deve ser um booleano." }, { status: 400 });
      }
      const item = await setTrainingActive(id, body.active);
      return NextResponse.json({ item });
    }
    const data = parseTrainingUpdateInput(body);
    const item = await updateTraining(id, data);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof TrainingValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.message.includes("não encontrado") ? 404 : 400 });
    }
    throw error;
  }
}
