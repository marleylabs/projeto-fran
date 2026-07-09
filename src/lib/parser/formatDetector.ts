import type { PdfPageRows } from "@/lib/pdf/extractRows";
import { rowText } from "@/lib/pdf/extractRows";

export type FormatoRelatorio = "extrato-mensal" | "relatorio-sintetico" | "desconhecido";

/**
 * Identifica qual dos formatos de folha suportados o PDF corresponde, olhando para
 * frases/rótulos característicos de cada layout nas primeiras páginas.
 */
export function detectFormat(pages: PdfPageRows[]): FormatoRelatorio {
  const sampleRows = pages.slice(0, 2).flatMap((p) => p.rows);
  const text = sampleRows.map(rowText).join(" \n ");
  const upper = text.toUpperCase();

  if (upper.includes("EXTRATO MENSAL")) return "extrato-mensal";

  const mentionsSintetico = /RELAT[OÓ0]RIO\s+SINT[EÉ3]TICO/.test(upper);
  const looksLikeTable =
    upper.includes("PROVENTOS") &&
    upper.includes("DESCONTOS") &&
    (upper.includes("CÓDIGO") || upper.includes("C.DIGO") || upper.includes("CODIGO"));

  if (mentionsSintetico || looksLikeTable) return "relatorio-sintetico";

  return "desconhecido";
}
