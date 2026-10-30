// Ciclos de Alimentação MA: o mês é dividido em 1º ciclo (dias 1–15) e 2º ciclo (16–fim). Lotes antigos
// sem ciclo (cycle 0) são o "Histórico mensal". Datas sempre comparadas em UTC (as ocorrências são gravadas
// como meia-noite UTC).

/** Ciclo MA válido: 1 ou 2. */
export type FoodMaCycle = 1 | 2;

/** Type guard para validar o ciclo recebido da API. */
export function isFoodMaCycle(value: number): value is FoodMaCycle {
  return value === 1 || value === 2;
}

/** Rótulo exibido na tela/planilha; qualquer valor diferente de 1/2 é tratado como histórico mensal. */
export function foodMaCycleLabel(cycle: number) {
  return cycle === 1 ? "1º Ciclo (dias 1 a 15)" : cycle === 2 ? "2º Ciclo (dia 16 ao fim do mês)" : "Histórico mensal";
}

/** true se a data pertence à competência (ano/mês) e à metade do mês do ciclo informado. */
export function occurrenceBelongsToMaCycle(date: Date, year: number, month: number, cycle: FoodMaCycle) {
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && (cycle === 1 ? date.getUTCDate() <= 15 : date.getUTCDate() >= 16);
}
