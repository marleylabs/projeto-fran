import type { PdfPageRows } from "@/lib/pdf/extractRows";
import type { LinhaSintetico, SinteticoResult } from "@/lib/types/sintetico";
import { parseSinteticoRows } from "./rowParser";
import { parseSinteticoCompanyInfo } from "./companyParser";
import { computeSinteticoTotais } from "./computeTotals";

function dedupeByMat(linhas: LinhaSintetico[], avisos: string[]): LinhaSintetico[] {
  const seen = new Map<string, LinhaSintetico>();
  const result: LinhaSintetico[] = [];
  for (const linha of linhas) {
    if (linha.mat && seen.has(linha.mat)) {
      avisos.push(`Colaborador com matrícula "${linha.mat}" (${linha.nome}) apareceu mais de uma vez; apenas a primeira ocorrência foi mantida.`);
      continue;
    }
    if (linha.mat) seen.set(linha.mat, linha);
    result.push(linha);
  }
  return result;
}

/**
 * Parser do formato "Relatório Sintético de Folha de Pagamento" (tabela, uma linha
 * por colaborador). IMPORTANTE: este parser foi construído sem acesso a um PDF real
 * desse formato — a estrutura de colunas foi reconstruída a partir da planilha de
 * referência do usuário (abas "Report" e "Tabela2"). Trate os resultados como
 * experimentais até validar contra um PDF real.
 */
export function parseSinteticoFromPages(pages: PdfPageRows[]): SinteticoResult {
  const avisos: string[] = [
    "Formato 'Relatório Sintético' em modo experimental: ainda não foi validado contra um PDF real deste layout. Revise os valores antes de usar para folha oficial.",
  ];

  const allRows = pages.flatMap((p) => p.rows);
  const { linhas: rawLinhas, otherRows, anchorsFound } = parseSinteticoRows(allRows);

  if (!anchorsFound) {
    avisos.push("Não foi possível localizar a linha de cabeçalho da tabela (CÓDIGO/NOME/SALÁRIO/...); a extração pode estar incompleta.");
  }

  const empresa = parseSinteticoCompanyInfo(otherRows);
  const linhas = dedupeByMat(rawLinhas, avisos);

  if (linhas.length === 0) {
    avisos.push("Nenhum colaborador foi identificado no PDF. Verifique se o layout corresponde ao 'Relatório Sintético' esperado.");
  }

  for (const l of linhas) {
    if (l.camposBaixaConfianca.length > 0) {
      avisos.push(`Colaborador "${l.nome || l.mat}" possui campos com baixa confiança de leitura: ${l.camposBaixaConfianca.join(", ")}.`);
    }
  }

  const totais = computeSinteticoTotais(linhas);

  return {
    formato: "relatorio-sintetico",
    empresa,
    linhas,
    totais,
    avisos,
    experimental: true,
  };
}
