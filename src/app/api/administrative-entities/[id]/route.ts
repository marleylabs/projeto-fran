// /api/administrative-entities/[id] — edição de um cadastro administrativo (empresa/CNPJ usado como
// empresa pagadora/tomadora nas seções de Contas a Pagar). Chamado pela tela src/app/cadastros/page.tsx.
// A validação e normalização (CNPJ, flags Projeta/Boinga etc.) ficam em modules/administrative-entities/schema.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  AdministrativeEntityValidationError,
  parseAdministrativeEntityInput,
} from "@/modules/administrative-entities/schema";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH: atualiza o cadastro `id`. Permissão: MASTER_DATA_MANAGE — 401 sem sessão, 403 sem permissão.
 * Corpo JSON validado por parseAdministrativeEntityInput (substitui todos os campos editáveis).
 * Retorna { item }. Erros: 400 dados inválidos (AdministrativeEntityValidationError), 404 cadastro inexistente;
 * outros erros (ex.: CNPJ duplicado no banco) sobem como 500.
 */
export async function PATCH(request: Request, context: Context) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  if (response) return response;
  const { id } = await context.params;
  try {
    const data = parseAdministrativeEntityInput(await request.json().catch(() => null));
    const existing = await prisma.administrativeEntity.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
    const item = await prisma.administrativeEntity.update({ where: { id }, data });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof AdministrativeEntityValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
