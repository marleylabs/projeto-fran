import { NextResponse } from "next/server";
import { parsePayrollPdfAny } from "@/lib/parser/router";
import { deleteUpload, findDuplicateUpload, getCombinedUploadById, saveUpload } from "@/lib/db/uploads";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

export async function POST(request: Request) {
  const { response: authResponse } = await requireUser();
  if (authResponse) return authResponse;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requisição inválida: envie o arquivo como multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo PDF foi enviado." }, { status: 400 });
  }

  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return NextResponse.json({ error: "O arquivo enviado não parece ser um PDF." }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo excede o tamanho máximo permitido (30MB)." }, { status: 400 });
  }

  const duplicateAction = formData.get("duplicateAction");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parsePayrollPdfAny(buffer);
    let responseResult = result;

    try {
      if (result.formato !== "desconhecido") {
        const duplicate = await findDuplicateUpload(result);

        if (duplicate && duplicateAction !== "replace" && duplicateAction !== "keep_both") {
          return NextResponse.json({ duplicate: true, existing: duplicate, result }, { status: 409 });
        }

        if (duplicate && duplicateAction === "replace") {
          await deleteUpload(duplicate.id);
        }
      }

      const saved = await saveUpload(file.name, result);
      result.id = saved.id;
      responseResult = (await getCombinedUploadById(saved.id)) ?? result;
    } catch (dbError) {
      console.error("Falha ao salvar extração no banco de dados:", dbError);
      result.avisos.push("Não foi possível salvar esta extração no banco de dados; ela não aparecerá no histórico após recarregar a página.");
    }

    return NextResponse.json(responseResult);
  } catch (error) {
    console.error("Falha ao processar PDF de folha de pagamento:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido ao processar o PDF.";
    return NextResponse.json({ error: `Falha ao processar o PDF: ${message}` }, { status: 500 });
  }
}
