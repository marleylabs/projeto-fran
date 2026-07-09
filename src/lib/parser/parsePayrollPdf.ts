import { extractPdfRows, type PdfPageRows } from "@/lib/pdf/extractRows";
import { segmentEmployees } from "./segmentEmployees";
import { parseCompanyInfo } from "./companyParser";
import { parseEmployeeBlock } from "./employeeParser";
import { parseTotaisImpressos } from "./totalsParser";
import { computeTotaisGerais } from "./computeTotals";
import type { Colaborador, ExtractionResult } from "@/lib/types/payroll";

const EPSILON = 0.02;

function dedupeByCodigo(colaboradores: Colaborador[], avisos: string[]): Colaborador[] {
  const seen = new Map<string, Colaborador>();
  const result: Colaborador[] = [];
  for (const c of colaboradores) {
    if (c.codigo && seen.has(c.codigo)) {
      avisos.push(`Colaborador com código "${c.codigo}" (${c.nome}) apareceu mais de uma vez; apenas a primeira ocorrência foi mantida.`);
      continue;
    }
    if (c.codigo) seen.set(c.codigo, c);
    result.push(c);
  }
  return result;
}

/** Parser do formato "Extrato Mensal" (bloco por colaborador) a partir das linhas já extraídas do PDF. */
export function parseExtratoMensalFromPages(pages: PdfPageRows[]): ExtractionResult {
  const avisos: string[] = [];
  const { companyHeaderRows, employeeBlocks, totalGeralRow, liquidoGeralRow } = segmentEmployees(pages);
  const empresa = parseCompanyInfo(companyHeaderRows);

  let colaboradores = employeeBlocks.map((block, i) => parseEmployeeBlock(block, i));
  colaboradores = dedupeByCodigo(colaboradores, avisos);

  if (colaboradores.length === 0) {
    avisos.push("Nenhum colaborador foi identificado no PDF. Verifique se o layout corresponde ao 'Extrato Mensal' esperado.");
  }

  for (const c of colaboradores) {
    if (c.camposBaixaConfianca.length > 0) {
      avisos.push(`Colaborador "${c.nome || c.codigo}" possui campos com baixa confiança de leitura: ${c.camposBaixaConfianca.join(", ")}.`);
    }
  }

  const totaisGerais = computeTotaisGerais(colaboradores);

  const impresso = parseTotaisImpressos(totalGeralRow, liquidoGeralRow);
  if (impresso.totalProventos !== null && Math.abs(impresso.totalProventos - totaisGerais.totalProventos) > EPSILON) {
    avisos.push(
      `Total de proventos calculado (${totaisGerais.totalProventos}) diverge do total impresso no PDF (${impresso.totalProventos}).`
    );
  }
  if (impresso.totalDescontos !== null && Math.abs(impresso.totalDescontos - totaisGerais.totalDescontos) > EPSILON) {
    avisos.push(
      `Total de descontos calculado (${totaisGerais.totalDescontos}) diverge do total impresso no PDF (${impresso.totalDescontos}).`
    );
  }
  if (impresso.liquidoGeral !== null && Math.abs(impresso.liquidoGeral - totaisGerais.liquidoGeral) > EPSILON) {
    avisos.push(
      `Líquido geral calculado (${totaisGerais.liquidoGeral}) diverge do total impresso no PDF (${impresso.liquidoGeral}).`
    );
  }

  return {
    formato: "extrato-mensal",
    empresa,
    colaboradores,
    totaisGerais: {
      ...totaisGerais,
      totalProventosImpresso: impresso.totalProventos ?? undefined,
      totalDescontosImpressoPDF: impresso.totalDescontos ?? undefined,
      liquidoGeralImpressoPDF: impresso.liquidoGeral ?? undefined,
    },
    metodoLeitura: "texto",
    avisos,
  };
}

/** Mantido para uso direto/scripts de teste: extrai o PDF do zero e assume o formato Extrato Mensal. */
export async function parsePayrollPdf(fileBuffer: Buffer): Promise<ExtractionResult> {
  const { pages, hasExtractableText } = await extractPdfRows(fileBuffer);

  if (!hasExtractableText) {
    return {
      formato: "extrato-mensal",
      empresa: { cnpj: "", nome: "", competencia: "", emissao: "", hora: "" },
      colaboradores: [],
      totaisGerais: {
        totalColaboradores: 0,
        totalProventos: 0,
        totalDescontos: 0,
        liquidoGeral: 0,
        totalFGTS: 0,
        totalINSS: 0,
        totalIRRF: 0,
        totalHE: 0,
      },
      metodoLeitura: "ocr",
      avisos: ["Não foi possível extrair texto do PDF (provável imagem escaneada). OCR ainda não está disponível nesta versão do sistema."],
    };
  }

  return parseExtratoMensalFromPages(pages);
}
