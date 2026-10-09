import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { MAX_POINT_MIRROR_FILE_SIZE } from "@/modules/accounts-payable/breakfast/point-mirror";
import { BasicBasketPointMirrorError } from "@/modules/accounts-payable/basic-basket/point-mirror";
import { previewBasicBasketPointMirror } from "@/modules/accounts-payable/basic-basket/point-mirror-server";

export const runtime = "nodejs";
// Prévia do Espelho de Ponto da Cesta Básica (Falta Injustificada e Férias). Mesma permissão e limite do Café da
// Manhã. O arquivo é lido em memória e descartado; a resposta não contém CPF completo; só os ajustes processados
// dos colaboradores selecionados são guardados (id devolvido para o salvamento).
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o arquivo do Espelho de Ponto." }, { status: 400 });
    if (!/\.(csv|xlsx)$/i.test(file.name)) return NextResponse.json({ error: "Formato não suportado. Envie o Espelho de Ponto em .xlsx ou .csv." }, { status: 400 });
    if (file.size > MAX_POINT_MIRROR_FILE_SIZE) return NextResponse.json({ error: "Arquivo muito grande (limite de 10 MB)." }, { status: 413 });
    let selectedIds: string[] = [];
    try { const raw = JSON.parse(String(form?.get("selectedIds") ?? "[]")); if (Array.isArray(raw)) selectedIds = raw.filter((id): id is string => typeof id === "string"); } catch { selectedIds = []; }
    return NextResponse.json(await previewBasicBasketPointMirror({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, year: Number(form?.get("year")), month: Number(form?.get("month")), selectedIds, userId: user.id }));
  } catch (error) {
    if (error instanceof BasicBasketPointMirrorError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("BASIC_BASKET_POINT_MIRROR_ERROR"); // sem conteúdo do arquivo/CPF
    return NextResponse.json({ error: "Não foi possível processar o Espelho de Ponto." }, { status: 500 });
  }
}
