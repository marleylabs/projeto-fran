// Totais impressos no rodapé do Extrato Mensal, usados só para conferência com os calculados.

import type { PdfRow } from "@/lib/pdf/extractRows";
import { extractLabelValues } from "./rowHelpers";
import { parseBRNumber } from "@/lib/normalize/money";

const TOTAL_LABELS = ["Total Geral Proventos:", "Total Geral Descontos:", "Líquido Geral:"];

/** null quando o rótulo não foi encontrado ou o valor é ilegível. */
export interface TotaisImpressos {
  totalProventos: number | null;
  totalDescontos: number | null;
  liquidoGeral: number | null;
}

/** Lê "Total Geral Proventos/Descontos" e "Líquido Geral" das linhas achadas por segmentEmployees (aceita null). */
export function parseTotaisImpressos(totalGeralRow: PdfRow | null, liquidoGeralRow: PdfRow | null): TotaisImpressos {
  const fields: Record<string, string> = {};
  if (totalGeralRow) Object.assign(fields, extractLabelValues(totalGeralRow, TOTAL_LABELS));
  if (liquidoGeralRow) Object.assign(fields, extractLabelValues(liquidoGeralRow, TOTAL_LABELS));

  return {
    totalProventos: parseBRNumber(fields["Total Geral Proventos:"]),
    totalDescontos: parseBRNumber(fields["Total Geral Descontos:"]),
    liquidoGeral: parseBRNumber(fields["Líquido Geral:"]),
  };
}
