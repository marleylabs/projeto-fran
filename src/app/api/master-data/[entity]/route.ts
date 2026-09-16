import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";

const ENTITIES = ["companies", "suppliers", "projects", "contracts", "cost-centers", "departments", "categories", "ledger-accounts", "branches"] as const;
type EntityName = (typeof ENTITIES)[number];

function isEntity(value: string): value is EntityName {
  return ENTITIES.includes(value as EntityName);
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Campo obrigatório: ${key}`);
  return value.trim();
}

type EntityRouteContext = { params: Promise<{ entity: string }> };

export async function GET(_request: Request, context: EntityRouteContext) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_READ);
  if (response) return response;
  const { entity } = await context.params;
  if (!isEntity(entity)) return NextResponse.json({ error: "Cadastro desconhecido." }, { status: 404 });

  const items = await (async () => {
    switch (entity) {
      case "companies": return prisma.company.findMany({ orderBy: { legalName: "asc" } });
      case "suppliers": return prisma.supplier.findMany({ orderBy: { legalName: "asc" } });
      case "projects": return prisma.project.findMany({ include: { company: true }, orderBy: { name: "asc" } });
      case "contracts": return prisma.contract.findMany({ include: { company: true, supplier: true, project: true }, orderBy: { name: "asc" } });
      case "cost-centers": return prisma.costCenter.findMany({ include: { company: true }, orderBy: { name: "asc" } });
      case "departments": return prisma.department.findMany({ include: { company: true }, orderBy: { name: "asc" } });
      case "categories": return prisma.category.findMany({ include: { parent: true }, orderBy: { name: "asc" } });
      case "ledger-accounts": return prisma.ledgerAccount.findMany({ orderBy: { code: "asc" } });
      case "branches": return prisma.branch.findMany({ include: { company: true }, orderBy: { name: "asc" } });
    }
  })();
  return NextResponse.json({ items });
}

export async function POST(request: Request, context: EntityRouteContext) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  if (response) return response;
  const { entity } = await context.params;
  if (!isEntity(entity)) return NextResponse.json({ error: "Cadastro desconhecido." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  try {
    const item = await (async () => {
      switch (entity) {
        case "companies": return prisma.company.create({ data: { legalName: requiredString(body, "legalName"), tradeName: typeof body.tradeName === "string" ? body.tradeName.trim() || null : null, taxId: requiredString(body, "taxId") } });
        case "suppliers": return prisma.supplier.create({ data: { legalName: requiredString(body, "legalName"), tradeName: typeof body.tradeName === "string" ? body.tradeName.trim() || null : null, taxId: typeof body.taxId === "string" ? body.taxId.trim() || null : null, email: typeof body.email === "string" ? body.email.trim() || null : null } });
        case "projects": return prisma.project.create({ data: { companyId: requiredString(body, "companyId"), code: requiredString(body, "code"), name: requiredString(body, "name") } });
        case "contracts": return prisma.contract.create({ data: { companyId: requiredString(body, "companyId"), code: requiredString(body, "code"), name: requiredString(body, "name"), supplierId: typeof body.supplierId === "string" ? body.supplierId || null : null, projectId: typeof body.projectId === "string" ? body.projectId || null : null, amount: typeof body.amount === "string" && body.amount ? new Prisma.Decimal(body.amount) : null, currency: typeof body.currency === "string" ? body.currency.toUpperCase() : "BRL" } });
        case "cost-centers": return prisma.costCenter.create({ data: { companyId: requiredString(body, "companyId"), code: requiredString(body, "code"), name: requiredString(body, "name") } });
        case "departments": return prisma.department.create({ data: { companyId: requiredString(body, "companyId"), code: requiredString(body, "code"), name: requiredString(body, "name") } });
        case "categories": return prisma.category.create({ data: { code: requiredString(body, "code"), name: requiredString(body, "name"), parentId: typeof body.parentId === "string" ? body.parentId || null : null } });
        case "ledger-accounts": return prisma.ledgerAccount.create({ data: { code: requiredString(body, "code"), name: requiredString(body, "name") } });
        case "branches": return prisma.branch.create({ data: { companyId: requiredString(body, "companyId"), code: requiredString(body, "code"), name: requiredString(body, "name"), taxId: typeof body.taxId === "string" ? body.taxId.trim() || null : null } });
      }
    })();
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Campo obrigatório:")) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Já existe um cadastro com essa chave." }, { status: 409 });
    throw error;
  }
}
