import type { PdfRow } from "@/lib/pdf/extractRows";
import { rowText } from "@/lib/pdf/extractRows";

/** Linhas de cabeçalho de página, repetidas em toda página do relatório. */
export function isPageHeaderRow(row: PdfRow): boolean {
  const t = rowText(row);
  return (
    /^Página:/.test(t) ||
    /^Emissão:/.test(t) ||
    /^Horas:/.test(t) ||
    /^Situações:/.test(t) ||
    /^EXTRATO MENSAL/.test(t) ||
    /^Todos$/.test(t) ||
    /^Empresa:/.test(t) ||
    /^Competência:/.test(t) ||
    /^Cálculo:/.test(t) ||
    /^Complemento de cálculo:/.test(t) ||
    /^CNPJ:/.test(t) ||
    /^Folha Mensal/.test(t) ||
    /^\d{2}\/\d{4}$/.test(t) || // competência solta, ex.: "06/2026"
    /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t) || // CNPJ solto
    /^\d+ - .+ (LTDA|COMERCIO|INDUSTRIA|EIRELI|S\/A|E)$/.test(t)
  );
}

/** Rodapé repetido em toda página. */
export function isFooterRow(row: PdfRow): boolean {
  return /^Sistema licenciado para/.test(rowText(row));
}

/** Linha de assinatura/talão, sem informação útil para extração. */
export function isSignatureRow(row: PdfRow): boolean {
  const t = rowText(row);
  return /^Assinatura$/.test(t) || /Data de pagamento\s*:/.test(t) || /^_{5,}/.test(t);
}

/** Início de um bloco de colaborador: linha com os rótulos "Empr.:" e "CPF:". */
export function isEmployeeStartRow(row: PdfRow): boolean {
  const labels = row.items.map((i) => i.text.trim());
  return labels.includes("Empr.:") && labels.includes("CPF:");
}

export function isResumoRubricaHeaderRow(row: PdfRow): boolean {
  return /^Resumo por Rubrica/.test(rowText(row));
}

export function isTotalGeralRow(row: PdfRow): boolean {
  return /Total Geral Proventos:/.test(rowText(row));
}

export function isLiquidoGeralRow(row: PdfRow): boolean {
  return /^Líquido Geral:/.test(rowText(row));
}
