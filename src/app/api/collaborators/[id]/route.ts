import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { parseCollaboratorInput, type CollaboratorInput } from "@/modules/collaborators/schema";
import { CollaboratorValidationError, CPF_IN_USE_MESSAGE, collaboratorWriteError, deleteCollaborator } from "@/modules/collaborators/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE); if (response) return response;
  try {
    const { id } = await context.params; const body = await request.json() as CollaboratorInput; const { cpf, admissionDate, ...profile } = parseCollaboratorInput(body);
    // Sem a chave "cpf"/"admissionDate" no corpo, o valor atual não é alterado; enviada vazia, é limpo (ação explícita do formulário).
    const data = { ...profile, ...("cpf" in body ? { cpf } : {}), ...("admissionDate" in body ? { admissionDate } : {}) };
    // CPF de outro colaborador: bloqueia (nunca transfere). O próprio CPF pode ser mantido/corrigido.
    if ("cpf" in data && data.cpf && await prisma.foodEmployee.findFirst({ where: { cpf: data.cpf, NOT: { id } }, select: { id: true } })) return NextResponse.json({ error: CPF_IN_USE_MESSAGE }, { status: 409 });
    return NextResponse.json({ item: await prisma.foodEmployee.update({ where: { id }, data }) });
  }
  catch (error) { const known = await collaboratorWriteError(error); return NextResponse.json({ error: known?.message ?? (error instanceof Error ? error.message : "Dados inválidos.") }, { status: known?.status ?? 400 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE); if (response) return response;
  try { const { id } = await context.params; return NextResponse.json(await deleteCollaborator(id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: error instanceof CollaboratorValidationError ? 409 : 500 }); }
}
