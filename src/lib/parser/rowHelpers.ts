import type { PdfRow, PdfTextItem } from "@/lib/pdf/extractRows";

/**
 * Extrai pares rótulo->valor de uma linha do tipo "Rótulo: valor Rótulo2: valor2 ...",
 * onde rótulo e valor já vêm ordenados por X (esquerda->direita) mas o valor de um
 * rótulo pode estar posicionado antes OU depois dele no fluxo do PDF original — por
 * isso a extração acontece sobre a lista já ordenada por X (ver extractRows.ts).
 *
 * Regra: cada item de texto que termina em ":" (ou está na lista de rótulos
 * conhecidos) é tratado como rótulo; o próximo item da linha (por X) que não seja
 * ele mesmo um rótulo é o seu valor.
 */
export function extractLabelValues(row: PdfRow, knownLabels: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const items = row.items;

  const isLabel = (text: string) => knownLabels.some((l) => text.trim() === l || text.trim().startsWith(l));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const trimmed = item.text.trim();
    const matchedLabel = knownLabels.find((l) => trimmed === l || trimmed.startsWith(l));
    if (!matchedLabel) continue;

    // Caso "Filial: 1" -> rótulo e valor grudados no mesmo item de texto.
    const inlineValue = trimmed.slice(matchedLabel.length).trim();
    if (inlineValue) {
      result[matchedLabel] = inlineValue;
      continue;
    }

    // Caso contrário, o valor é o próximo item da linha que não seja outro rótulo.
    const next = items[i + 1];
    if (next && !isLabel(next.text.trim())) {
      result[matchedLabel] = next.text.trim();
    }
  }

  return result;
}

export function findItemAfter(items: PdfTextItem[], predicate: (t: string) => boolean): PdfTextItem | undefined {
  const idx = items.findIndex((i) => predicate(i.text));
  if (idx === -1) return undefined;
  return items[idx + 1];
}
