import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingValidationError, parseManualTrainingInput } from "@/modules/trainings/schema";
import { createManualTraining, listTrainings } from "@/modules/trainings/server";

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
