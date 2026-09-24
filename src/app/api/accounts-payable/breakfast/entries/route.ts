import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { addBreakfastEntries, type BreakfastEntryInput } from "@/modules/accounts-payable/breakfast/manual-server";
import { BreakfastValidationError } from "@/modules/accounts-payable/breakfast/server";
import { BreakfastCalculationError } from "@/modules/accounts-payable/breakfast/calculations";

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const body = (await request.json().catch(() => null)) as { year?: number; month?: number; administrativeEntityId?: string; entries?: BreakfastEntryInput[] } | null;
    if (!body || typeof body.administrativeEntityId !== "string") throw new BreakfastValidationError("Cadastro da obrigação é obrigatório.");
    return NextResponse.json(await addBreakfastEntries({ year: Number(body.year), month: Number(body.month), administrativeEntityId: body.administrativeEntityId, entries: body.entries ?? [], userId: user.id }), { status: 201 });
  } catch (error) {
    if (error instanceof BreakfastValidationError || error instanceof BreakfastCalculationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
