// Formatação de EXIBIÇÃO da Folha (Extrato Mensal / Relatório Sintético). Sem regra: os valores vêm da extração.
import type { StatusTone } from "@/components/ui";
import type { DataTableSort } from "@/components/ui";
import { formatBRNumber } from "@/lib/normalize/money";
import { comparePtBr } from "@/lib/sorting/ptBr";

export const brl = (value: number) => `R$ ${formatBRNumber(value)}`;

/** Situação lida do PDF → tom do StatusBadge (mesmo mapeamento do badge antigo; desconhecida = neutra). */
const SITUACAO_TONE: Record<string, StatusTone> = { Trabalhando: "success", Férias: "info", Afastado: "warning" };
export const situacaoTone = (situacao: string): StatusTone => SITUACAO_TONE[situacao] ?? "neutral";

export const leituraLabel = (metodo: string) => (metodo === "texto" ? "Texto" : "OCR");

/** Ordenação de exibição por coluna: números numericamente, textos em pt-BR. Não altera os dados. */
export function sortRows<Row>(rows: readonly Row[], sort: DataTableSort | null, value: (row: Row, key: string) => string | number) {
  if (!sort) return [...rows];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a, sort.key), right = value(b, sort.key);
    const result = typeof left === "number" && typeof right === "number" ? left - right : comparePtBr(String(left ?? ""), String(right ?? ""));
    return result * factor;
  });
}
