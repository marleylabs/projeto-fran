import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { normalizeCollaboratorSearch, parseCollaboratorInput, type CollaboratorInput } from "@/modules/collaborators/schema";

export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_READ); if (response) return response;
  const p = new URL(request.url).searchParams; const query = normalizeCollaboratorSearch(p.get("q")); const status = p.get("status") ?? "active";
  const rows = await prisma.foodEmployee.findMany({ where: status === "all" ? {} : { active: status !== "inactive" }, orderBy: { officialName: "asc" } });
  const filtered = rows.filter((row) => !query || normalizeCollaboratorSearch(`${row.officialName} ${row.jobTitle} ${row.department} ${row.costCenter}`).includes(query));
  return NextResponse.json({ items: filtered.slice(0, Number(p.get("limit")) || 250), filters: { departments: [...new Set(rows.map((r) => r.department))].sort(), costCenters: [...new Set(rows.map((r) => r.costCenter).filter(Boolean))].sort() } });
}

export async function POST(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE); if (response) return response;
  try { const data = parseCollaboratorInput(await request.json() as CollaboratorInput); const possible = await prisma.foodEmployee.findMany({ where: { normalizedName: data.normalizedName } }); if (possible.length) return NextResponse.json({ error: "Possível colaborador já cadastrado.", possible }, { status: 409 }); return NextResponse.json({ item: await prisma.foodEmployee.create({ data }) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 }); }
}
