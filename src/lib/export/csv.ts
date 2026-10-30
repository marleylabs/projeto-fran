// Exportação CSV (no navegador) da lista detalhada de colaboradores do Extrato Mensal.
// Contém dados pessoais (CPF, admissão): o arquivo é gerado localmente a partir do que a tela já recebeu.
import type { Colaborador } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";
import { COLABORADOR_HEADERS, colaboradorToRow } from "./rows";
import { triggerDownload } from "./download";

// Delimitador ";" e decimal "," para abrir corretamente no Excel em pt-BR.
const DELIMITER = ";";

// Números saem no formato BR; células com ";", aspas ou quebra de linha vão entre aspas (aspas dobradas).
function escapeCsvCell(value: string | number): string {
  const str = typeof value === "number" ? formatBRNumber(value) : String(value ?? "");
  if (str.includes(DELIMITER) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Gera e baixa o CSV com COLABORADOR_HEADERS + uma linha por colaborador. */
export function exportCsv(colaboradores: Colaborador[], filename = "colaboradores.csv") {
  const lines = [
    COLABORADOR_HEADERS.map(escapeCsvCell).join(DELIMITER),
    ...colaboradores.map((c) => colaboradorToRow(c).map(escapeCsvCell).join(DELIMITER)),
  ];
  // BOM para o Excel reconhecer UTF-8 corretamente (acentos).
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}
