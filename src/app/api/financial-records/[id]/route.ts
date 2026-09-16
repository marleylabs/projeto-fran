import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const { id } = await context.params;
  const item = await prisma.financialRecord.findUnique({ where: { id }, include: { company: true, administrativeEntity: true, supplier: true, project: true, contract: true } });
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
}
