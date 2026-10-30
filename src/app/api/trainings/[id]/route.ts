// /api/trainings/[id] — detalhe e edição de um treinamento (telas de Treinamentos e Contas a Pagar > Treinamentos).
// Regras em modules/trainings/{schema,server}.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingValidationError, parseTrainingUpdateInput } from "@/modules/trainings/schema";
import { getTraining, setTrainingActive, updateTraining } from "@/modules/trainings/server";

/** GET: retorna { item }. Permissão: TRAINING_READ — 401 sem sessão, 403 sem permissão. 404 se não existe. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_READ);
  if (response) return response;
  const { id } = await context.params;
  const item = await getTraining(id);
  if (!item) return NextResponse.json({ error: "Treinamento não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

/**
 * PATCH: corpo JSON. Permissão: TRAINING_MANAGE.
 *  - { active: boolean } sozinho: só ativa/inativa (setTrainingActive);
 *  - demais campos: validados por parseTrainingUpdateInput e gravados por updateTraining.
 * supplierId/proposalId são recusados (400): fornecedor e proposta não mudam por aqui.
 * Erros: TrainingValidationError → 404 se a mensagem contém "não encontrado", senão 400.
 */
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
