import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { createFinancialRecord, InvalidAdministrativeEntityError } from "@/modules/accounts-payable/server/financialRecords";

export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Number(query.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize")) || 25));
  const search = query.get("search")?.trim();
  const searchDigits = search?.replace(/\D/g, "") ?? "";
  const where: Prisma.FinancialRecordWhereInput = search ? {
    OR: [
      { identifier: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { documentNumber: { contains: search, mode: "insensitive" } },
      { administrativeEntity: { is: { legalName: { contains: search, mode: "insensitive" } } } },
      { administrativeEntity: { is: { tradeName: { contains: search, mode: "insensitive" } } } },
      ...(searchDigits ? [{ administrativeEntity: { is: { cnpj: { contains: searchDigits } } } }] : []),
    ],
  } : {};
  const [items, total] = await prisma.$transaction([
    prisma.financialRecord.findMany({ where, include: { administrativeEntity: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financialRecord.count({ where }),
  ]);
  return NextResponse.json({ items, pagination: { page, pageSize, total } });
}

export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  const required = ["administrativeEntityId", "grossAmount"];
  if (required.some((key) => typeof body[key] !== "string" || !String(body[key]).trim())) {
    return NextResponse.json({ error: "Preencha os campos obrigatórios." }, { status: 400 });
  }
  try {
    const grossAmount = new Prisma.Decimal(String(body.grossAmount));
    if (!grossAmount.greaterThan(0)) return NextResponse.json({ error: "O valor bruto deve ser maior que zero." }, { status: 400 });
    const item = await createFinancialRecord({
      administrativeEntityId: String(body.administrativeEntityId),
      grossAmount, createdByUserId: user.id,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidAdministrativeEntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message.includes("Decimal")) return NextResponse.json({ error: "Valor bruto inválido." }, { status: 400 });
    throw error;
  }
}
