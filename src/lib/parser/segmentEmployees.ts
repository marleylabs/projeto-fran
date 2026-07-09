import type { PdfPageRows, PdfRow } from "@/lib/pdf/extractRows";
import {
  isEmployeeStartRow,
  isFooterRow,
  isPageHeaderRow,
  isResumoRubricaHeaderRow,
  isSignatureRow,
  isTotalGeralRow,
} from "./boilerplate";

export interface EmployeeBlock {
  /** Linhas relevantes do bloco (sem cabeçalho/rodapé/assinatura repetidos). */
  rows: PdfRow[];
}

export interface SegmentationResult {
  companyHeaderRows: PdfRow[];
  employeeBlocks: EmployeeBlock[];
  totalGeralRow: PdfRow | null;
  liquidoGeralRow: PdfRow | null;
}

/**
 * Achata as páginas em uma única sequência de linhas, na ordem em que aparecem
 * no documento, e separa em blocos por colaborador. O "Resumo por Rubrica" e
 * tudo que vem depois dele é descartado da segmentação por colaborador (não é
 * um colaborador, é o resumo agregado do fim do relatório).
 */
export function segmentEmployees(pages: PdfPageRows[]): SegmentationResult {
  const allRows: PdfRow[] = pages.flatMap((p) => p.rows);

  const firstEmployeeIdx = allRows.findIndex(isEmployeeStartRow);
  const companyHeaderRows = firstEmployeeIdx === -1 ? [] : allRows.slice(0, firstEmployeeIdx);

  let resumoIdx = allRows.findIndex(isResumoRubricaHeaderRow);
  if (resumoIdx === -1) resumoIdx = allRows.length;

  let totalGeralRow: PdfRow | null = null;
  let liquidoGeralRow: PdfRow | null = null;

  const employeeBlocks: EmployeeBlock[] = [];
  let currentBlockRows: PdfRow[] = [];

  const flushBlock = () => {
    if (currentBlockRows.length > 0) {
      employeeBlocks.push({ rows: currentBlockRows });
      currentBlockRows = [];
    }
  };

  for (let i = firstEmployeeIdx === -1 ? allRows.length : firstEmployeeIdx; i < resumoIdx; i++) {
    const row = allRows[i];

    if (isTotalGeralRow(row)) {
      totalGeralRow = row;
      flushBlock();
      continue;
    }
    if (totalGeralRow && !liquidoGeralRow && /Líquido Geral:/.test(row.items.map((it) => it.text).join(" "))) {
      liquidoGeralRow = row;
      continue;
    }
    if (totalGeralRow) continue; // após o total geral só resta o resumo por rubrica (já fora do range)

    if (isPageHeaderRow(row) || isFooterRow(row) || isSignatureRow(row)) continue;

    if (isEmployeeStartRow(row)) {
      flushBlock();
    }
    currentBlockRows.push(row);
  }
  flushBlock();

  return { companyHeaderRows, employeeBlocks, totalGeralRow, liquidoGeralRow };
}
