import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { parseCollaboratorInput, type CollaboratorInput } from "@/modules/collaborators/schema";
import { CollaboratorValidationError, deleteCollaborator } from "@/modules/collaborators/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE); if (response) return response;
  try { const { id } = await context.params; const data = parseCollaboratorInput(await request.json() as CollaboratorInput); return NextResponse.json({ item: await prisma.foodEmployee.update({ where: { id }, data }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE); if (response) return response;
  try { const { id } = await context.params; return NextResponse.json(await deleteCollaborator(id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: error instanceof CollaboratorValidationError ? 409 : 500 }); }
}
