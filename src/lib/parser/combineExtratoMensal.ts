import type { Colaborador, Empresa, ExtractionResult } from "@/lib/types/payroll";
import { computeTotaisGerais } from "./computeTotals";

export interface ExtratoMensalSource {
  uploadId?: string;
  fileName?: string;
  result: ExtractionResult;
}

function sourceKey(source: ExtratoMensalSource): string {
  return source.uploadId || source.result.empresa.cnpj || source.result.empresa.nome || "origem";
}

function annotateColaborador(c: Colaborador, source: ExtratoMensalSource): Colaborador {
  const empresa = source.result.empresa;
  return {
    ...c,
    id: `${sourceKey(source)}:${c.id}`,
    empresaNome: empresa.nome,
    empresaCnpj: empresa.cnpj,
    competencia: empresa.competencia,
    arquivoOrigem: source.fileName,
  };
}

function mergedEmpresa(sources: ExtratoMensalSource[]): Empresa {
  const first = sources[0]?.result.empresa;
  if (!first) return { cnpj: "", nome: "", competencia: "", emissao: "", hora: "" };
  if (sources.length === 1) return first;

  const uniqueNames = new Set(sources.map((s) => s.result.empresa.nome).filter(Boolean));
  return {
    cnpj: "",
    nome: `Consolidado (${uniqueNames.size} empresa${uniqueNames.size === 1 ? "" : "s"})`,
    competencia: first.competencia,
    emissao: "",
    hora: "",
  };
}

export function combineExtratoMensalSources(sources: ExtratoMensalSource[]): ExtractionResult | null {
  if (sources.length === 0) return null;

  const colaboradores = sources.flatMap((source) => source.result.colaboradores.map((c) => annotateColaborador(c, source)));
  const avisos = sources.flatMap((source) =>
    source.result.avisos.map((aviso) => {
      const empresa = source.result.empresa.nome || source.fileName || "PDF";
      return `${empresa}: ${aviso}`;
    })
  );

  return {
    formato: "extrato-mensal",
    id: sources[0]?.uploadId ?? sources[0]?.result.id,
    consolidado: sources.length > 1,
    empresas: sources.map((source) => ({
      nome: source.result.empresa.nome,
      cnpj: source.result.empresa.cnpj,
      competencia: source.result.empresa.competencia,
      uploadId: source.uploadId,
      fileName: source.fileName,
      totalColaboradores: source.result.colaboradores.length,
      liquidoGeral: source.result.totaisGerais.liquidoGeral,
    })),
    empresa: mergedEmpresa(sources),
    colaboradores,
    totaisGerais: computeTotaisGerais(colaboradores),
    metodoLeitura: sources.some((source) => source.result.metodoLeitura === "ocr") ? "ocr" : "texto",
    avisos,
  };
}
