// Script manual de diagnóstico da exportação Excel da folha (extrato mensal).
// Lê ../FOLHAD_2.PDF (PDF real, fora do repositório — dado pessoal de folha), converte para linhas unificadas
// e grava test-output.xlsx na pasta atual. Não é usado pela aplicação nem pelos testes automatizados.
import { readFile } from "fs/promises";
import ExcelJS from "exceljs";
import { parsePayrollPdf } from "../src/lib/parser/parsePayrollPdf";
import { SINTETICO_HEADERS } from "../src/lib/export/sinteticoRows";
import { unifiedRowFromColaborador, unifiedRowToArray } from "../src/lib/export/unifiedRow";

async function main() {
  const buf = await readFile("../FOLHAD_2.PDF");
  const result = await parsePayrollPdf(buf);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Colaboradores");
  sheet.columns = SINTETICO_HEADERS.map(() => ({ width: 16 }));
  const rows = result.colaboradores.map((c) => unifiedRowToArray(unifiedRowFromColaborador(c)));
  sheet.addTable({
    name: "Colaboradores",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: SINTETICO_HEADERS.map((name) => ({ name, filterButton: true })),
    rows,
  });

  // Formato contábil em R$ e código do colaborador com 6 dígitos; colunas 4–18 são os valores monetários.
  const ACCOUNTING_FORMAT = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
  sheet.getColumn(1).numFmt = "000000";
  for (let col = 4; col <= 18; col++) sheet.getColumn(col).numFmt = ACCOUNTING_FORMAT;

  await workbook.xlsx.writeFile("test-output.xlsx");
  console.log("Sheets:", workbook.worksheets.map((s) => s.name));
  console.log("Rows written:", rows.length);
}
main();
