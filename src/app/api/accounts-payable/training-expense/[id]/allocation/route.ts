// PUT /api/accounts-payable/training-expense/[id]/allocation — redistribui o valor final do treinamento entre
// os participantes existentes (editTrainingExpenseAllocation; total e participantes não mudam).
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { TrainingExpenseValidationError } from "@/modules/accounts-payable/training-expense/schema";
import { editTrainingExpenseAllocation } from "@/modules/accounts-payable/training-expense/server";

/**
 * Permissão: FINANCIAL_RECORDS_UPDATE; 401 sem sessão / 403 sem permissão (requirePermission).
 * Entrada (JSON): { rows: [{ participantId, allocatedAmount (string|number) }] } — não vazio. Saída: { item }.
 * Erros: 400 TrainingExpenseValidationError (inclui linha malformada).
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_UPDATE);
  if (response || !user) return response;
  const { id } = await context.params;
  try {
    const body = (await request.json().catch(() => null)) as { rows?: unknown } | null;
    if (!body || !Array.isArray(body.rows) || !body.rows.length) throw new TrainingExpenseValidationError("Informe o rateio a salvar.");
    // Valor repassado como string; validação e conversão decimal ficam no servidor.
    const rows = body.rows.map((row) => {
      const entry = row as { participantId?: unknown; allocatedAmount?: unknown };
      if (typeof entry.participantId !== "string" || (typeof entry.allocatedAmount !== "string" && typeof entry.allocatedAmount !== "number")) throw new TrainingExpenseValidationError("Linha de rateio inválida.");
      return { participantId: entry.participantId, allocatedAmount: String(entry.allocatedAmount) };
    });
    const item = await editTrainingExpenseAllocation(id, rows, user.id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof TrainingExpenseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
