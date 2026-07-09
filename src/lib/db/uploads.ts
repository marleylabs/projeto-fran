import { prisma } from "./prisma";
import type { PayrollExtractionResult } from "@/lib/parser/router";

function summaryOf(result: PayrollExtractionResult): { totalColaboradores: number; liquidoGeral: number } {
  if (result.formato === "extrato-mensal") {
    return { totalColaboradores: result.totaisGerais.totalColaboradores, liquidoGeral: result.totaisGerais.liquidoGeral };
  }
  if (result.formato === "relatorio-sintetico") {
    return { totalColaboradores: result.totais.totalColaboradores, liquidoGeral: result.totais.liquidoGeral };
  }
  return { totalColaboradores: 0, liquidoGeral: 0 };
}

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

export async function findDuplicateUpload(result: PayrollExtractionResult) {
  const keys = duplicateKeysOf(result);
  if (!keys) return null;

  return prisma.upload.findFirst({
    where: { formato: result.formato, empresaChave: keys.empresaChave, periodoChave: keys.periodoChave },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, createdAt: true, totalColaboradores: true, liquidoGeral: true },
  });
}

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

export async function deleteUpload(id: string) {
  return prisma.upload.delete({ where: { id } });
}

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

export async function getUploadById(id: string) {
  return prisma.upload.findUnique({ where: { id } });
}
