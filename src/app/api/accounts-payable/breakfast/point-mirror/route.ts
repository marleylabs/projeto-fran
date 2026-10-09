import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { MAX_POINT_MIRROR_FILE_SIZE, PointMirrorError } from "@/modules/accounts-payable/breakfast/point-mirror";
import { previewBreakfastPointMirror } from "@/modules/accounts-payable/breakfast/point-mirror-server";

export const runtime = "nodejs";
// Prévia do Espelho de Ponto (Café da Manhã → Pessoas). Mesma permissão do lançamento (entries).
// Nada é persistido: o arquivo é lido em memória e descartado; a resposta não contém CPF completo.
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o arquivo do Espelho de Ponto." }, { status: 400 });
    if (!/\.(csv|xlsx)$/i.test(file.name)) return NextResponse.json({ error: "Formato não suportado. Envie o Espelho de Ponto em .csv ou .xlsx." }, { status: 400 });
    if (file.size > MAX_POINT_MIRROR_FILE_SIZE) return NextResponse.json({ error: "Arquivo muito grande (limite de 10 MB)." }, { status: 413 });
    let selectedIds: string[] = [];
    try { const raw = JSON.parse(String(form?.get("selectedIds") ?? "[]")); if (Array.isArray(raw)) selectedIds = raw.filter((id): id is string => typeof id === "string"); } catch { selectedIds = []; }
    return NextResponse.json(await previewBreakfastPointMirror({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, selectedIds }));
  } catch (error) {
    if (error instanceof PointMirrorError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("BREAKFAST_POINT_MIRROR_ERROR"); // sem conteúdo do arquivo/CPF
    return NextResponse.json({ error: "Não foi possível processar o Espelho de Ponto." }, { status: 500 });
  }
}
