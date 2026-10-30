// Script manual ponta a ponta do relatório Sintético: npx tsx scripts/test-sintetico-e2e.ts <arquivo.pdf>.
// Passa o PDF pelo roteador de parsers e imprime o resultado completo em JSON.
// Para um PDF sintético sem dados reais, gere um com scripts/generate-test-sintetico-pdf.ts.
import { readFile } from "fs/promises";
import { parsePayrollPdfAny } from "../src/lib/parser/router";

async function main() {
  const buf = await readFile(process.argv[2]);
  const result = await parsePayrollPdfAny(buf);
  console.log("formato:", result.formato);
  console.log(JSON.stringify(result, null, 2));
}

main();
