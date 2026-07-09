import type { PdfRow } from "@/lib/pdf/extractRows";
import { HEADER_KEYWORDS, SINTETICO_FIELD_SEQUENCE, type SinteticoFieldKey } from "./fieldSequence";

export interface ColumnAnchor {
  x: number;
  field: SinteticoFieldKey;
}

function countHeaderKeywordMatches(row: PdfRow): number {
  const text = row.items.map((i) => i.text.trim().toUpperCase());
  let matches = 0;
  for (const keyword of HEADER_KEYWORDS) {
    if (text.some((t) => t.includes(keyword))) matches++;
  }
  return matches;
}

const MIN_HEADER_MATCHES = 6;

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
  if (items.length < 8) return null;

  const count = Math.min(items.length, SINTETICO_FIELD_SEQUENCE.length);
  const anchors: ColumnAnchor[] = [];
  for (let i = 0; i < count; i++) {
    anchors.push({ x: items[i].x, field: SINTETICO_FIELD_SEQUENCE[i] });
  }
  return anchors;
}

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
