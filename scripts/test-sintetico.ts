import type { PdfRow } from "../src/lib/pdf/extractRows";
import { parseSinteticoRows } from "../src/lib/parser/sintetico/rowParser";
import { parseSinteticoCompanyInfo } from "../src/lib/parser/sintetico/companyParser";
import { computeSinteticoTotais } from "../src/lib/parser/sintetico/computeTotals";

function row(y: number, items: [string, number][]): PdfRow {
  return { y, items: items.map(([text, x]) => ({ text, x, y })) };
}

// Cabeçalho de página (linhas de empresa) — simula rótulos soltos, como no relatório real.
const empresaRow = row(800, [["Empresa : 00173 PROJETA CONSULTORIA E SERVICOS LTDA", 0]]);
const deptoRow = row(790, [["Departamento: VALE BATIMETRIA I", 0]]);
const periodoRow = row(780, [["Período: 01/05/2026 a 31/05/2026", 0]]);
const emissaoRow = row(770, [["Emissão : 03/07/2026 14:42:50", 0]]);

// Linha de cabeçalho da tabela (20 âncoras na ordem esperada).
const headerRow = row(700, [
  ["CÓDIGO", 0],
  ["NOME", 40],
  ["Horas", 150],
  ["Salário", 190],
  ["Hora Extra", 230],
  ["Repouso", 270],
  ["salario familia", 310],
  ["Insalubridade", 350],
  ["Periculosidade", 390],
  ["Adic. Noturno", 430],
  ["Outros", 470],
  ["Total", 510],
  ["INSS", 550],
  ["Vale", 590],
  ["Descont autoriz", 630],
  ["IRRF", 670],
  ["Outros", 710],
  ["Total", 750],
  ["Receber", 790],
  ["Assinatura", 830],
]);

// Colaborador 1: linha completa.
const emp1 = row(680, [
  ["000025", 0],
  ["JOAO VICTOR AGUIAR PIRES", 40],
  ["220:00", 150],
  ["3117,21", 190],
  ["0", 230],
  ["0", 270],
  ["0", 310],
  ["0", 350],
  ["0", 390],
  ["0", 430],
  ["0", 470],
  ["3117,21", 510],
  ["262,65", 550],
  ["0", 590],
  ["0", 630],
  ["0", 670],
  ["247,43", 710],
  ["510,08", 750],
  ["2607,13", 790],
]);

// Colaborador 2: nome numa linha, valores na linha seguinte (caso de mesclagem).
const emp2Nome = row(660, [
  ["000128", 0],
  ["MARCELO GILSON FERREIRA CALDAS", 40],
]);
const emp2Valores = row(650, [
  ["220:00", 150],
  ["1656,6", 190],
  ["0", 230],
  ["0", 270],
  ["0", 310],
  ["0", 350],
  ["0", 390],
  ["0", 430],
  ["0", 470],
  ["1656,6", 510],
  ["124,77", 550],
  ["99,4", 590],
  ["200", 630],
  ["0", 670],
  ["510,64", 710],
  ["934,81", 750],
  ["721,79", 790],
]);

const totalGeralRow = row(600, [["TOTAL", 0], ["GERAL", 40]]);

const allRows = [empresaRow, deptoRow, periodoRow, emissaoRow, headerRow, emp1, emp2Nome, emp2Valores, totalGeralRow];

const { linhas, otherRows, anchorsFound, totalGeralRow: foundTotal } = parseSinteticoRows(allRows);
console.log("anchorsFound:", anchorsFound);
console.log("linhas encontradas:", linhas.length);
console.log(JSON.stringify(linhas, null, 2));
console.log("totalGeralRow encontrado:", !!foundTotal);

const empresa = parseSinteticoCompanyInfo(otherRows);
console.log("empresa:", JSON.stringify(empresa, null, 2));

const totais = computeSinteticoTotais(linhas);
console.log("totais:", JSON.stringify(totais, null, 2));
