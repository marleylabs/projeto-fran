import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { normalizeCpf } from "@/lib/cpf";
import { normalizeCollaboratorSearch, parseCollaboratorInput, type CollaboratorInput } from "@/modules/collaborators/schema";
import { collaboratorWriteError, CPF_IN_USE_MESSAGE } from "@/modules/collaborators/server";

// CPF só é devolvido quando pedido (`fields=cpf`, usado pelo cadastro); seletores de colaborador
// de Alimentação/VT/Café/Treinamentos continuam recebendo a lista sem CPF.
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_READ); if (response) return response;
  const p = new URL(request.url).searchParams; const query = normalizeCollaboratorSearch(p.get("q")); const status = p.get("status") ?? "active";
  const withCpf = (p.get("fields") ?? "").split(",").includes("cpf"); const cpfQuery = withCpf ? normalizeCpf(p.get("q")) : "";
  const rows = await prisma.foodEmployee.findMany({ where: status === "all" ? {} : { active: status !== "inactive" }, orderBy: { officialName: "asc" }, omit: { cpf: !withCpf } });
  const filtered = rows.filter((row) => !query || normalizeCollaboratorSearch(`${row.officialName} ${row.jobTitle} ${row.department} ${row.costCenter}`).includes(query) || (cpfQuery.length >= 3 && "cpf" in row && Boolean(row.cpf?.includes(cpfQuery))));
  return NextResponse.json({ items: filtered.slice(0, Number(p.get("limit")) || 250), filters: { departments: [...new Set(rows.map((r) => r.department))].sort(), costCenters: [...new Set(rows.map((r) => r.costCenter).filter(Boolean))].sort() } });
}

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
