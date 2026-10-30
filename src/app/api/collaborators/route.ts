// /api/collaborators — listagem e criação de colaboradores (modelo FoodEmployee, base única usada por
// Alimentação, VT, Café, Cesta, Treinamentos). Por padrão o Prisma omite cpf/admissionDate (ver lib/db/prisma.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { normalizeCpf } from "@/lib/cpf";
import { normalizeCollaboratorSearch, parseCollaboratorInput, type CollaboratorInput } from "@/modules/collaborators/schema";
import { collaboratorWriteError, CPF_IN_USE_MESSAGE } from "@/modules/collaborators/server";

// CPF e Data de Admissão só são devolvidos quando pedidos (`fields=cpf,admissionDate`, usado pelo cadastro); seletores de colaborador
// de Alimentação/VT/Café/Treinamentos continuam recebendo a lista sem CPF.
/**
 * GET: lista colaboradores. Permissão: MASTER_DATA_READ — 401 sem sessão, 403 sem permissão.
 * Query: q (busca normalizada em nome/cargo/departamento/centro de custo; com fields=cpf, também por CPF a partir de
 * 3 dígitos), status ("active" padrão | "inactive" | "all"), fields ("cpf,admissionDate"), limit (padrão 250).
 * Retorna { items, filters: { departments, costCenters } }. Filtro textual é feito em memória após o findMany.
 */
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_READ); if (response) return response;
  const p = new URL(request.url).searchParams; const query = normalizeCollaboratorSearch(p.get("q")); const status = p.get("status") ?? "active";
  const fields = (p.get("fields") ?? "").split(","); const withCpf = fields.includes("cpf"); const withAdmission = fields.includes("admissionDate"); const cpfQuery = withCpf ? normalizeCpf(p.get("q")) : "";
  const rows = await prisma.foodEmployee.findMany({ where: status === "all" ? {} : { active: status !== "inactive" }, orderBy: { officialName: "asc" }, omit: { cpf: !withCpf, admissionDate: !withAdmission } });
  const filtered = rows.filter((row) => !query || normalizeCollaboratorSearch(`${row.officialName} ${row.jobTitle} ${row.department} ${row.costCenter}`).includes(query) || (cpfQuery.length >= 3 && "cpf" in row && Boolean(row.cpf?.includes(cpfQuery))));
  return NextResponse.json({ items: filtered.slice(0, Number(p.get("limit")) || 250), filters: { departments: [...new Set(rows.map((r) => r.department))].sort(), costCenters: [...new Set(rows.map((r) => r.costCenter).filter(Boolean))].sort() } });
}

/**
 * POST: cria colaborador. Permissão: MASTER_DATA_MANAGE. Corpo JSON validado por parseCollaboratorInput.
 * Retorna 201 { item }. Erros: 409 nome normalizado já existente (devolve `possible` para a tela decidir)
 * ou CPF já cadastrado; demais via collaboratorWriteError ou 400.
 */
export async function POST(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE); if (response) return response;
  try {
    const data = parseCollaboratorInput(await request.json() as CollaboratorInput);
    const possible = await prisma.foodEmployee.findMany({ where: { normalizedName: data.normalizedName } }); if (possible.length) return NextResponse.json({ error: "Possível colaborador já cadastrado.", possible }, { status: 409 });
    if (data.cpf && await prisma.foodEmployee.findUnique({ where: { cpf: data.cpf }, select: { id: true } })) return NextResponse.json({ error: CPF_IN_USE_MESSAGE }, { status: 409 });
    return NextResponse.json({ item: await prisma.foodEmployee.create({ data }) }, { status: 201 });
  }
  catch (error) { const known = await collaboratorWriteError(error); return NextResponse.json({ error: known?.message ?? (error instanceof Error ? error.message : "Dados inválidos.") }, { status: known?.status ?? 400 }); }
}
