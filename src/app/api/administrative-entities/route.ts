import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  AdministrativeEntityValidationError,
  parseAdministrativeEntityInput,
} from "@/modules/administrative-entities/schema";

function optionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_READ);
  if (response) return response;

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const digits = query.replace(/\D/g, "");
  const activityArea = searchParams.get("activityArea")?.trim() || undefined;
  const locality = searchParams.get("locality")?.trim() || undefined;
  const appliesProjeta = optionalBoolean(searchParams.get("appliesProjeta"));
  const appliesBoinga = optionalBoolean(searchParams.get("appliesBoinga"));

  const items = await prisma.administrativeEntity.findMany({
    where: {
      activityArea,
      locality,
      appliesProjeta,
      appliesBoinga,
      ...(query
        ? {
            OR: [
              { legalName: { contains: query, mode: "insensitive" } },
              { tradeName: { contains: query, mode: "insensitive" } },
              { activityArea: { contains: query, mode: "insensitive" } },
              ...(digits ? [{ cnpj: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ legalName: "asc" }, { tradeName: "asc" }],
  });
  const facets = await prisma.administrativeEntity.findMany({
    select: { activityArea: true, locality: true },
    distinct: ["activityArea", "locality"],
  });
  return NextResponse.json({
    items,
    filters: {
      activityAreas: [...new Set(facets.map((item) => item.activityArea))].sort(),
      localities: [...new Set(facets.map((item) => item.locality))].sort(),
    },
  });
}

export async function POST(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  if (response) return response;
  try {
    const data = parseAdministrativeEntityInput(await request.json().catch(() => null));
    const item = await prisma.administrativeEntity.create({ data });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof AdministrativeEntityValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
