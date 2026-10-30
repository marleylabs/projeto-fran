// Contrato compartilhado (cliente e servidor) do lançamento manual de refeições de Alimentação
// (rota /api/accounts-payable/food/manual → manual-server.ts; tela /pagamentos/alimentacao).

/** Resposta de sucesso: lote afetado, ocorrências criadas, refeições, duplicadas ignoradas e total. */
export type ManualFoodSuccessResponse = {
  ok: true;
  batchId: string | null;
  created: number;
  meals: number;
  skipped: number;
  total: number;
  duplicateDetails: Array<{ employeeId: string | null; name: string | null; date: string | null }>;
};

/** Resposta de erro (mensagem pronta para o usuário). */
export type ManualFoodErrorResponse = { ok: false; error: string };
export type ManualFoodResponse = ManualFoodSuccessResponse | ManualFoodErrorResponse;

// Valor por refeição do lançamento manual (MA e PA, mesma regra): o campo vem pré-preenchido com o
// valor configurado do fornecedor e pode ser ajustado; o servidor usa o valor informado e só recorre
// ao valor configurado do fornecedor quando nada foi informado.
export const manualFoodUsesSupplierPrice = (amount?: string | null) => !amount?.trim();

/**
 * Gera o produto cartesiano colaboradores × datas e separa as combinações que já existem
 * (duplicateKeys no formato "employeeId:data") das que serão criadas.
 */
export function buildManualFoodCombinations(employeeIds: string[], dates: string[], duplicateKeys = new Set<string>()) {
  const combinations = employeeIds.flatMap((employeeId) => dates.map((date) => ({ employeeId, date })));
  return {
    accepted: combinations.filter(({ employeeId, date }) => !duplicateKeys.has(`${employeeId}:${date}`)),
    skipped: combinations.filter(({ employeeId, date }) => duplicateKeys.has(`${employeeId}:${date}`)),
  };
}

/**
 * Lê a resposta da API de lançamento manual no cliente. Tolera corpo vazio ou não-JSON; lança Error com a
 * mensagem do servidor (ou uma genérica) se a resposta não for sucesso.
 */
export async function parseManualFoodResponse(response: Response): Promise<ManualFoodSuccessResponse> {
  const raw = await response.text();
  let body: ManualFoodResponse | null = null;
  if (raw.trim()) {
    try { body = JSON.parse(raw) as ManualFoodResponse; } catch { body = null; }
  }
  if (!response.ok || !body || body.ok !== true) {
    const message = body && body.ok === false && body.error.trim()
      ? body.error
      : "Não foi possível salvar as ocorrências.";
    throw new Error(message);
  }
  return body;
}
