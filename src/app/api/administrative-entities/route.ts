// /api/administrative-entities — listagem/filtro e criação de cadastros administrativos (empresas por CNPJ).
// Consumido pelo cadastro (src/app/cadastros/page.tsx), pelo CompanyPicker e pelas seções de Contas a Pagar
// (Alimentação, VT, Café, Cesta, Plano de Saúde, Treinamentos) para escolher a empresa do rateio.
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  AdministrativeEntityValidationError,
  parseAdministrativeEntityInput,
} from "@/modules/administrative-entities/schema";

// Converte o parâmetro de query "true"/"false" em boolean; qualquer outro valor (ou ausência) = sem filtro.
function optionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/**
 * GET: lista cadastros. Permissão: MASTER_DATA_READ — 401 sem sessão, 403 sem permissão.
 * Query: q (busca em razão social, nome fantasia, área; se tiver dígitos, também no CNPJ), activityArea, locality,
 * appliesProjeta/appliesBoinga ("true"/"false"). Retorna { items, filters: { activityAreas, localities } };
 * os filtros são calculados sobre a base inteira (não sobre o resultado filtrado) para alimentar os selects da tela.
 */
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

/**
 * POST: cria um cadastro. Permissão: MASTER_DATA_MANAGE — 401 sem sessão, 403 sem permissão.
 * Corpo JSON validado por parseAdministrativeEntityInput. Retorna 201 { item }; 400 em dado inválido.
 */
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
