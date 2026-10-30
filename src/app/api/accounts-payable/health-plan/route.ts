// /api/accounts-payable/health-plan — faturas do Plano de Saúde da competência e importação do PDF da operadora.
// Lógica em modules/accounts-payable/health-plan/server.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { HealthPlanValidationError, MAX_HEALTH_PLAN_FILE_SIZE, getHealthPlanCompetence, importHealthPlanInvoice } from "@/modules/accounts-payable/health-plan/server";

export const runtime = "nodejs";
// Campo vazio/ausente vira null: sem competência informada, importHealthPlanInvoice usa o mês do vencimento.
const optionalNumber = (value: FormDataEntryValue | null | undefined) => (value ? Number(value) : null);

/**
 * GET ?year=&month= — Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Saída: { invoices }. Erros: 400 HealthPlanValidationError.
 */
export async function GET(request: Request) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json({ invoices: await getHealthPlanCompetence(Number(params.get("year")), Number(params.get("month"))) }); }
  catch (error) { if (error instanceof HealthPlanValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}

// Upload do PDF da operadora: extrai, confere Cobrado com o Valor Bruto e grava fatura + obrigação + rateio por titular.
/**
 * POST multipart: file (PDF, até MAX_HEALTH_PLAN_FILE_SIZE), administrativeEntityId, year?, month?.
 * Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission). Saída: 201 { invoice }.
 * Erros: 400 arquivo ausente/não PDF/HealthPlanValidationError; 413 arquivo grande; 500 genérico.
 */
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione o PDF da fatura." }, { status: 400 });
    if (!/\.pdf$/i.test(file.name)) return NextResponse.json({ error: "Envie a fatura em PDF." }, { status: 400 });
    if (file.size > MAX_HEALTH_PLAN_FILE_SIZE) return NextResponse.json({ error: "Arquivo muito grande (limite de 15 MB)." }, { status: 413 });
    const invoice = await importHealthPlanInvoice({ year: optionalNumber(form?.get("year")), month: optionalNumber(form?.get("month")), administrativeEntityId: String(form?.get("administrativeEntityId") ?? ""), fileName: file.name, buffer: Buffer.from(await file.arrayBuffer()), userId: user.id });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof HealthPlanValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("HEALTH_PLAN_IMPORT_ERROR"); // sem conteúdo do PDF (CPF, nomes)
    return NextResponse.json({ error: "Não foi possível processar o PDF." }, { status: 500 });
  }
}
