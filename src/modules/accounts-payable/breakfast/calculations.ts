// Funções puras (sem Prisma/server-only): a MESMA fórmula roda no backend (fonte da verdade)
// e no frontend (apenas prévia). Valores monetários em centavos inteiros — nunca float.
// O calendário de competência (dias úteis/feriados) é o compartilhado em @/modules/shared —
// mesma regra do Vale Transporte, ver @/modules/accounts-payable/transit-voucher/calculations.

export class BreakfastCalculationError extends Error {}

export const DEFAULT_UNIT_PRICE = "12.50";

// Regra operacional: só o departamento TOPOGEO recebe Café da Manhã. Fonte única (frontend e
// backend) — o backend é quem de fato garante isso (ver addBreakfastEntries), o frontend só
// evita mostrar uma escolha que o servidor recusaria.
export const BREAKFAST_ALLOWED_DEPARTMENT = "TOPOGEO";

const pad = (value: number) => String(value).padStart(2, "0");

const assertInteger = (value: number, label: string) => {
  if (!Number.isInteger(value)) throw new BreakfastCalculationError(`${label} deve ser um número inteiro.`);
};

export function parseUnitPriceToCents(value: string | number): number {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BreakfastCalculationError("Valor do café da manhã deve ser um valor monetário com até 2 casas decimais.");
  const cents = Math.round(Number(text) * 100);
  if (cents <= 0) throw new BreakfastCalculationError("Valor do café da manhã deve ser maior que zero.");
  return cents;
}

export const centsToDecimalString = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${pad(Math.abs(cents) % 100)}`;

// Quantidade base = dias úteis da competência (não editável pelo usuário). Desconto é específico
// do lançamento daquela competência — nunca vira configuração padrão do colaborador. Se o
// desconto for maior que (quantidade + extras), é erro de validação: nunca faz clamp em zero.
export function calculateFinalQuantity(baseQuantity: number, extraQuantity: number, discountQuantity: number) {
  assertInteger(baseQuantity, "Quantidade");
  assertInteger(extraQuantity, "Quantidade extras");
  assertInteger(discountQuantity, "Desconto");
  if (extraQuantity < 0) throw new BreakfastCalculationError("Quantidade extras não pode ser negativa.");
  if (discountQuantity < 0) throw new BreakfastCalculationError("Desconto não pode ser negativo.");
  const finalQuantity = baseQuantity + extraQuantity - discountQuantity;
  if (finalQuantity < 0) throw new BreakfastCalculationError("O desconto não pode ser maior que a quantidade disponível.");
  return finalQuantity;
}

// Valor unitário × quantidade final, em centavos.
export function calculateBreakfastEmployeeTotal(unitPriceCents: number, finalQuantity: number) {
  assertInteger(unitPriceCents, "Valor unitário");
  assertInteger(finalQuantity, "Quantidade final");
  if (finalQuantity <= 0) throw new BreakfastCalculationError("A quantidade final deve ser maior que zero.");
  return unitPriceCents * finalQuantity;
}

export type BreakfastObservationKind = "RETROACTIVE" | "OTHER";
export function formatBreakfastObservation(type: BreakfastObservationKind | null | undefined, details: string | null | undefined) {
  const text = (details ?? "").trim();
  if (!type) return text;
  if (type === "RETROACTIVE") return text ? `Retroativo: ${text}` : "Retroativo";
  return text;
}
