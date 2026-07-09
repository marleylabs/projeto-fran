import type { PdfRow } from "@/lib/pdf/extractRows";
import { extractLabelValues } from "./rowHelpers";
import { parseBRNumber } from "@/lib/normalize/money";

const TOTAL_LABELS = ["Total Geral Proventos:", "Total Geral Descontos:", "Líquido Geral:"];

export interface TotaisImpressos {
  totalProventos: number | null;
  totalDescontos: number | null;
  liquidoGeral: number | null;
}

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
