// Mapeamento das colunas do Relatório Sintético pela posição X dos títulos no cabeçalho da tabela.

import type { PdfRow } from "@/lib/pdf/extractRows";
import { HEADER_KEYWORDS, SINTETICO_FIELD_SEQUENCE, type SinteticoFieldKey } from "./fieldSequence";

/** X do título da coluna no cabeçalho e o campo correspondente. */
export interface ColumnAnchor {
  x: number;
  field: SinteticoFieldKey;
}

// Conta quantas palavras-chave de cabeçalho aparecem em algum item da linha.
function countHeaderKeywordMatches(row: PdfRow): number {
  const text = row.items.map((i) => i.text.trim().toUpperCase());
  let matches = 0;
  for (const keyword of HEADER_KEYWORDS) {
    if (text.some((t) => t.includes(keyword))) matches++;
  }
  return matches;
}

// Mínimo de palavras-chave para tratar a linha como cabeçalho (evita falso positivo em linha de dados).
const MIN_HEADER_MATCHES = 6;

/** true se a linha parece o cabeçalho da tabela. */
export function isHeaderRow(row: PdfRow): boolean {
  return countHeaderKeywordMatches(row) >= MIN_HEADER_MATCHES;
}

/**
 * Constrói as âncoras de coluna a partir da linha de cabeçalho detectada: a ordem
 * esquerda->direita dos itens dessa linha é mapeada 1:1 na sequência fixa de campos
 * conhecida (ver fieldSequence.ts). Retorna null se a linha não tiver âncoras suficientes.
 */
export function buildColumnAnchors(headerRow: PdfRow): ColumnAnchor[] | null {
  const items = headerRow.items.filter((i) => i.text.trim().length > 0);
  // Poucos itens: cabeçalho incompleto para o mapeamento posicional.
  if (items.length < 8) return null;

  const count = Math.min(items.length, SINTETICO_FIELD_SEQUENCE.length);
  const anchors: ColumnAnchor[] = [];
  for (let i = 0; i < count; i++) {
    anchors.push({ x: items[i].x, field: SINTETICO_FIELD_SEQUENCE[i] });
  }
  return anchors;
}

/** Campo da âncora mais próxima em X. Pressupõe `anchors` não vazio. */
export function nearestField(anchors: ColumnAnchor[], x: number): SinteticoFieldKey {
  let best = anchors[0];
  let bestDist = Math.abs(anchors[0].x - x);
  for (const anchor of anchors) {
    const dist = Math.abs(anchor.x - x);
    if (dist < bestDist) {
      best = anchor;
      bestDist = dist;
    }
  }
  return best.field;
}
