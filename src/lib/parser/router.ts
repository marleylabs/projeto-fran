import { extractPdfRows } from "@/lib/pdf/extractRows";
import { detectFormat } from "./formatDetector";
import { parseExtratoMensalFromPages } from "./parsePayrollPdf";
import { parseSinteticoFromPages } from "./sintetico/parseSintetico";
import type { ExtractionResult, FormatoDesconhecidoResult } from "@/lib/types/payroll";
import type { SinteticoResult } from "@/lib/types/sintetico";

export type PayrollExtractionResult = ExtractionResult | SinteticoResult | FormatoDesconhecidoResult;

/** Ponto de entrada único: extrai o texto do PDF, detecta o formato e chama o parser certo. */
export async function parsePayrollPdfAny(fileBuffer: Buffer): Promise<PayrollExtractionResult> {
  const { pages, hasExtractableText } = await extractPdfRows(fileBuffer);

  if (!hasExtractableText) {
    return {
      formato: "desconhecido",
      avisos: [
        "Não foi possível extrair texto do PDF (provável imagem escaneada). OCR ainda não está disponível nesta versão do sistema.",
      ],
    };
  }

  const formato = detectFormat(pages);

  if (formato === "extrato-mensal") return parseExtratoMensalFromPages(pages);
  if (formato === "relatorio-sintetico") return parseSinteticoFromPages(pages);

  return {
    formato: "desconhecido",
    avisos: [
      "Não foi possível identificar o formato deste PDF. Formatos suportados: 'Extrato Mensal' e 'Relatório Sintético de Folha de Pagamento'.",
    ],
  };
}
