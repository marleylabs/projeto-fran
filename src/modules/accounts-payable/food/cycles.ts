export type FoodMaCycle = 1 | 2;

export function isFoodMaCycle(value: number): value is FoodMaCycle {
  return value === 1 || value === 2;
}

export function foodMaCycleLabel(cycle: number) {
  return cycle === 1 ? "1º Ciclo (dias 1 a 15)" : cycle === 2 ? "2º Ciclo (dia 16 ao fim do mês)" : "Histórico mensal";
}

export function occurrenceBelongsToMaCycle(date: Date, year: number, month: number, cycle: FoodMaCycle) {
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && (cycle === 1 ? date.getUTCDate() <= 15 : date.getUTCDate() >= 16);
}
