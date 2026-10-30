// /api/accounts-payable/training-expense — listagem e criação de lançamentos de despesa de Treinamento.
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingExpenseValidationError, parseCreateTrainingExpenseInput } from "@/modules/accounts-payable/training-expense/schema";
import { createTrainingExpenseDraft, listTrainingExpenses } from "@/modules/accounts-payable/training-expense/server";

/**
 * GET — Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
 * Query opcional: year, month, supplierId, trainingId, status (DRAFT|COMPLETED|CANCELLED), q (busca). Saída: { items }.
 * status não é validado aqui; valor desconhecido é repassado ao filtro do servidor.
 */
export async function GET(request: NextRequest) {
  const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const year = params.get("year") ? Number(params.get("year")) : undefined;
  const month = params.get("month") ? Number(params.get("month")) : undefined;
  const supplierId = params.get("supplierId") || undefined;
  const trainingId = params.get("trainingId") || undefined;
  const status = (params.get("status") as "DRAFT" | "COMPLETED" | "CANCELLED" | null) || undefined;
  const query = params.get("q") || undefined;
  const items = await listTrainingExpenses({ year, month, supplierId, trainingId, status: status ?? undefined, query });
  return NextResponse.json({ items });
}

/**
 * POST — cria rascunho (DRAFT). Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): ver parseCreateTrainingExpenseInput. Saída: 201 { item }. Erros: 400 TrainingExpenseValidationError.
 */
export async function POST(request: Request) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);
  if (response || !user) return response;
  try {
    const data = parseCreateTrainingExpenseInput(await request.json().catch(() => null));
    const item = await createTrainingExpenseDraft({ ...data, userId: user.id });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof TrainingExpenseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
