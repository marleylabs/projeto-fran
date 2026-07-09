import type { PdfRow } from "@/lib/pdf/extractRows";
import { extractLabelValues } from "./rowHelpers";
import type { Empresa } from "@/lib/types/payroll";

const COMPANY_LABELS = ["Empresa:", "CNPJ:", "Competência:", "Emissão:", "Horas:"];

/** Extrai os dados da empresa a partir das linhas de cabeçalho da primeira página. */
export function parseCompanyInfo(headerRows: PdfRow[]): Empresa {
  const fields: Record<string, string> = {};
  for (const row of headerRows) {
    Object.assign(fields, extractLabelValues(row, COMPANY_LABELS));
  }

  const empresaRaw = fields["Empresa:"] ?? "";
  const nome = empresaRaw.replace(/^\d+\s*-\s*/, "").trim();

  return {
    cnpj: fields["CNPJ:"] ?? "",
    nome,
    competencia: fields["Competência:"] ?? "",
    emissao: fields["Emissão:"] ?? "",
    hora: fields["Horas:"] ?? "",
  };
}
