import ExcelJS from "exceljs";
import type { SinteticoResult } from "@/lib/types/sintetico";
import { formatBRNumber } from "@/lib/normalize/money";
import { SINTETICO_HEADERS, linhaSinteticoToRow } from "./sinteticoRows";
import { triggerDownload } from "./download";

const DELIMITER = ";";

function escapeCsvCell(value: string | number): string {
  const str = typeof value === "number" ? formatBRNumber(value) : String(value ?? "");
  if (str.includes(DELIMITER) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportSinteticoCsv(result: SinteticoResult, filename = "relatorio-sintetico.csv") {
  const lines = [
    SINTETICO_HEADERS.map(escapeCsvCell).join(DELIMITER),
    ...result.linhas.map((l) => linhaSinteticoToRow(l).map(escapeCsvCell).join(DELIMITER)),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}

export function exportSinteticoJson(result: SinteticoResult, filename = "relatorio-sintetico.json") {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF64025F" } };
}

export async function exportSinteticoExcel(result: SinteticoResult, filename = "relatorio-sintetico.xlsx") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Extrato Mensal - Extrator de Folha";
  workbook.created = new Date();

  const resumoSheet = workbook.addWorksheet("Resumo");
  resumoSheet.columns = [{ width: 30 }, { width: 30 }];
  resumoSheet.addRow(["Empresa", `${result.empresa.codigo} ${result.empresa.nome}`.trim()]);
  resumoSheet.addRow(["Departamento", result.empresa.departamento]);
  resumoSheet.addRow(["Período", `${result.empresa.periodoInicio} a ${result.empresa.periodoFim}`]);
  resumoSheet.addRow(["Tipo de processo", result.empresa.tipoProcesso]);
  resumoSheet.addRow(["Emissão", `${result.empresa.emissao} ${result.empresa.hora}`]);
  resumoSheet.addRow([]);
  resumoSheet.addRow(["Total de colaboradores", result.totais.totalColaboradores]);
  resumoSheet.addRow(["Total salário", result.totais.totalSalario]);
  resumoSheet.addRow(["Total H.E", result.totais.totalHE]);
  resumoSheet.addRow(["Total proventos", result.totais.totalProventos]);
  resumoSheet.addRow(["Total INSS", result.totais.totalINSS]);
  resumoSheet.addRow(["Total VT", result.totais.totalVT]);
  resumoSheet.addRow(["Total IR", result.totais.totalIR]);
  resumoSheet.addRow(["Total descontos", result.totais.totalDescontos]);
  resumoSheet.addRow(["Líquido geral", result.totais.liquidoGeral]);

  const sheet = workbook.addWorksheet("Colaboradores");
  sheet.addRow([...SINTETICO_HEADERS]);
  styleHeaderRow(sheet.getRow(1));
  for (const l of result.linhas) {
    sheet.addRow(linhaSinteticoToRow(l));
  }
  sheet.columns.forEach((col) => (col.width = 16));
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + SINTETICO_HEADERS.length)}1` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, filename);
}
