// Persistência dos PDFs de folha processados (tabela Upload): o resultado completo da extração fica
// em `data` (JSON) junto com um resumo (colaboradores, líquido) e as chaves empresa/período usadas
// para detectar duplicidade. Chamado por /api/extract (salvar/duplicata) e /api/uploads/** (histórico,
// abrir, excluir). Os parsers ficam em src/lib/parser.
import { prisma } from "./prisma";
import type { PayrollExtractionResult } from "@/lib/parser/router";
import type { ExtractionResult } from "@/lib/types/payroll";
import { combineExtratoMensalSources } from "@/lib/parser/combineExtratoMensal";

// Resumo gravado em colunas próprias para a listagem do histórico não precisar ler o JSON inteiro.
function summaryOf(result: PayrollExtractionResult): { totalColaboradores: number; liquidoGeral: number } {
  if (result.formato === "extrato-mensal") {
    return { totalColaboradores: result.totaisGerais.totalColaboradores, liquidoGeral: result.totaisGerais.liquidoGeral };
  }
  if (result.formato === "relatorio-sintetico") {
    return { totalColaboradores: result.totais.totalColaboradores, liquidoGeral: result.totais.liquidoGeral };
  }
  return { totalColaboradores: 0, liquidoGeral: 0 };
}

/** Chaves de duplicidade: mesmo formato + empresa + período = mesmo upload. */
export interface DuplicateKeys {
  empresaChave: string;
  periodoChave: string;
  /** Texto amigável do período, para mostrar na confirmação (ex.: "06/2026"). */
  periodoLabel: string;
}

/**
 * Identifica empresa + período (Competência no Extrato Mensal, período no Relatório
 * Sintético) para detectar upload duplicado. Retorna null quando o PDF não trouxe
 * informação suficiente — nesse caso não bloqueamos o upload (evita falso positivo).
 */
export function duplicateKeysOf(result: PayrollExtractionResult): DuplicateKeys | null {
  if (result.formato === "extrato-mensal") {
    const empresaChave = result.empresa.cnpj || result.empresa.nome;
    const periodoChave = result.empresa.competencia;
    if (!empresaChave || !periodoChave) return null;
    return { empresaChave, periodoChave, periodoLabel: periodoChave };
  }
  if (result.formato === "relatorio-sintetico") {
    const empresaChave = result.empresa.codigo || result.empresa.nome;
    const { periodoInicio, periodoFim } = result.empresa;
    if (!empresaChave || !periodoInicio || !periodoFim) return null;
    return {
      empresaChave,
      periodoChave: `${periodoInicio}_${periodoFim}`,
      periodoLabel: `${periodoInicio} a ${periodoFim}`,
    };
  }
  return null;
}

/** Upload mais recente com o mesmo formato/empresa/período, ou null (também null se não há chaves). */
export async function findDuplicateUpload(result: PayrollExtractionResult) {
  const keys = duplicateKeysOf(result);
  if (!keys) return null;

  return prisma.upload.findFirst({
    where: { formato: result.formato, empresaChave: keys.empresaChave, periodoChave: keys.periodoChave },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, createdAt: true, totalColaboradores: true, liquidoGeral: true },
  });
}

/** Grava novo Upload com o resultado completo da extração. Não verifica duplicidade (feito antes pela rota). */
export async function saveUpload(fileName: string, result: PayrollExtractionResult) {
  const { totalColaboradores, liquidoGeral } = summaryOf(result);
  const keys = duplicateKeysOf(result);
  return prisma.upload.create({
    data: {
      fileName,
      formato: result.formato,
      totalColaboradores,
      liquidoGeral,
      empresaChave: keys?.empresaChave,
      periodoChave: keys?.periodoChave,
      data: result as object,
    },
  });
}

/** Exclui o upload; lança erro do Prisma (P2025) se o id não existir. */
export async function deleteUpload(id: string) {
  return prisma.upload.delete({ where: { id } });
}

/** Histórico dos últimos `limit` uploads (sem o JSON `data`), do mais novo para o mais antigo. */
export async function listUploads(limit = 20) {
  return prisma.upload.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      formato: true,
      createdAt: true,
      totalColaboradores: true,
      liquidoGeral: true,
      periodoChave: true,
    },
  });
}

/** Upload completo (inclui `data`) ou null. */
export async function getUploadById(id: string) {
  return prisma.upload.findUnique({ where: { id } });
}

/**
 * Abre um upload para exibição. Para Extrato Mensal, junta todos os uploads da mesma competência
 * (uma empresa por PDF) num único resultado via combineExtratoMensalSources; demais formatos, ou se a
 * combinação não for possível, devolvem o próprio upload. null se o id não existir.
 */
export async function getCombinedUploadById(id: string): Promise<PayrollExtractionResult | null> {
  const upload = await getUploadById(id);
  if (!upload) return null;

  const result = upload.data as unknown as PayrollExtractionResult;
  if (result.formato !== "extrato-mensal" || !upload.periodoChave) {
    return { ...result, id: upload.id };
  }

  const uploads = await prisma.upload.findMany({
    where: { formato: "extrato-mensal", periodoChave: upload.periodoChave },
    orderBy: [{ empresaChave: "asc" }, { createdAt: "asc" }],
    select: { id: true, fileName: true, data: true },
  });

  const combined = combineExtratoMensalSources(
    uploads
      .map((item) => ({ uploadId: item.id, fileName: item.fileName, result: item.data as unknown as ExtractionResult }))
      .filter((item) => item.result.formato === "extrato-mensal")
  );

  return combined ?? { ...result, id: upload.id };
}
