// Estados do lote de Alimentação (FoodBatch.status) e as permissões derivadas deles. Usado pela página
// /pagamentos/alimentacao e por food/server.ts. Lote em revisão ou com inconsistências ainda aceita
// edição/exclusão de ocorrências; READY é o lote finalizado (só leitura).

/** Status em que as ocorrências do lote ainda podem ser editadas/excluídas. */
export const FOOD_BATCH_EDITABLE_STATUSES = ["UNDER_REVIEW", "WITH_INCONSISTENCIES"] as const;
export type FoodBatchStatus = (typeof FOOD_BATCH_EDITABLE_STATUSES)[number] | "READY";

/** true se o lote ainda permite gerenciar (editar/excluir) ocorrências. */
export function canManageFoodOccurrences(status: FoodBatchStatus) {
  return FOOD_BATCH_EDITABLE_STATUSES.includes(status as (typeof FOOD_BATCH_EDITABLE_STATUSES)[number]);
}

/** true se o lote já foi finalizado (READY). */
export function isFoodBatchFinalized(status: FoodBatchStatus) {
  return status === "READY";
}
