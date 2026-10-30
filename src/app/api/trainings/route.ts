// /api/trainings — listagem e cadastro manual de treinamentos (telas de Treinamentos e Contas a Pagar > Treinamentos).
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingValidationError, parseManualTrainingInput } from "@/modules/trainings/schema";
import { createManualTraining, listTrainings } from "@/modules/trainings/server";

/**
 * GET: query q, supplierId, modality, attendanceType, active ("true"/"false"). Permissão: TRAINING_READ — 401 sem sessão, 403 sem permissão.
 * Retorna o objeto de listTrainings.
 */
export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_READ);
  if (response) return response;

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() || undefined;
  const supplierId = searchParams.get("supplierId")?.trim() || undefined;
  const modality = searchParams.get("modality")?.trim() || undefined;
  const attendanceType = searchParams.get("attendanceType")?.trim() || undefined;
  const activeParam = searchParams.get("active");
  const active = activeParam === "true" ? true : activeParam === "false" ? false : undefined;

  const result = await listTrainings({ query, supplierId, modality, attendanceType, active });
  return NextResponse.json(result);
}

/** POST: cria treinamento manual (corpo validado por parseManualTrainingInput). Permissão: TRAINING_MANAGE. 201 { item }; 400 inválido. */
export async function POST(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.TRAINING_MANAGE);
  if (response) return response;
  try {
    const data = parseManualTrainingInput(await request.json().catch(() => null));
    const item = await createManualTraining(data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof TrainingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
