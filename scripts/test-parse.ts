import { readFile } from "fs/promises";
import { parsePayrollPdf } from "../src/lib/parser/parsePayrollPdf";

async function main() {
  const path = process.argv[2];
  const buffer = await readFile(path);
  const result = await parsePayrollPdf(buffer);

  console.log("Método leitura:", result.metodoLeitura);
  console.log("Empresa:", JSON.stringify(result.empresa));
  console.log("Total colaboradores:", result.colaboradores.length);
  console.log("Totais gerais:", JSON.stringify(result.totaisGerais, null, 2));
  console.log("Avisos:", result.avisos.length ? result.avisos : "(nenhum)");

  console.log("\n--- Amostra colaborador (Anderson, código 41) ---");
  const anderson = result.colaboradores.find((c) => c.codigo === "41");
  console.log(JSON.stringify(anderson, null, 2));

  console.log("\n--- Todos os nomes/codigos extraídos ---");
  for (const c of result.colaboradores) {
    console.log(c.codigo, "|", c.nome, "|", c.situacao, "| líquido:", c.liquido, "| baixa confiança:", c.camposBaixaConfianca);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
