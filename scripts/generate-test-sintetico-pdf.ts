import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFile } from "fs/promises";

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([842, 595]); // A4 landscape
  const size = 8;

  const draw = (text: string, x: number, y: number) => {
    page.drawText(text, { x, y, size, font });
  };

  let y = 570;
  draw("Empresa : 00173 PROJETA CONSULTORIA E SERVICOS LTDA", 20, y);
  y -= 10;
  draw("Departamento: VALE BATIMETRIA I", 20, y);
  y -= 10;
  draw("Período: 01/05/2026 a 31/05/2026", 20, y);
  y -= 10;
  draw("Emissão : 03/07/2026 14:42:50", 20, y);
  y -= 10;
  draw("Relatório Sintético de Folha de Pagamento", 300, y);
  y -= 20;

  const cols = [20, 60, 200, 250, 300, 340, 380, 420, 460, 500, 540, 580, 620, 660, 700, 730, 760, 790, 815];
  const headerLabels = [
    "CÓDIGO",
    "NOME",
    "Horas",
    "Salário",
    "Hora Extra",
    "Repouso",
    "salario familia",
    "Insalubr",
    "Pericul",
    "Adic.",
    "Outros",
    "Total",
    "INSS",
    "Vale",
    "Descont",
    "IRRF",
    "Outros",
    "Total",
    "Receber",
  ];
  headerLabels.forEach((label, i) => draw(label, cols[i], y));
  y -= 15;

  const employees = [
    ["000025", "JOAO VICTOR AGUIAR PIRES", "220:00", "3.117,21", "0", "0", "0", "0", "0", "0", "0", "3.117,21", "262,65", "0", "0", "0", "247,43", "510,08", "2.607,13"],
    ["000035", "LEONARDO DE SOUSA BAIA", "220:00", "4.184,57", "0", "0", "0", "0", "0", "0", "0", "4.184,57", "390,73", "0", "0", "0", "144,58", "535,31", "3.649,26"],
  ];

  for (const emp of employees) {
    emp.forEach((val, i) => draw(val, cols[i], y));
    y -= 12;
  }

  // Colaborador com nome numa linha e valores na linha seguinte (quebra de página/linha).
  draw("000128", cols[0], y);
  draw("MARCELO GILSON FERREIRA CALDAS", cols[1], y);
  y -= 12;
  const marceloValues = ["220:00", "1.656,60", "0", "0", "0", "0", "0", "0", "0", "1.656,60", "124,77", "99,40", "200,00", "0", "510,64", "934,81", "721,79"];
  marceloValues.forEach((val, i) => draw(val, cols[i + 2], y));
  y -= 20;

  draw("TOTAL GERAL", 20, y);

  const bytes = await doc.save();
  await writeFile(process.argv[2] ?? "test-sintetico.pdf", bytes);
  console.log("PDF gerado.");
}

main();
