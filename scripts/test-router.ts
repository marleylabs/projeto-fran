// Script manual: verifica qual formato o roteador de parsers (parsePayrollPdfAny) detecta para ../FOLHAD_2.PDF
// (arquivo local fora do repositório). Não faz parte dos testes automatizados.
import { readFile } from "fs/promises";
import { parsePayrollPdfAny } from "../src/lib/parser/router";

async function main() {
  const buf = await readFile("../FOLHAD_2.PDF");
  const result = await parsePayrollPdfAny(buf);
  console.log("formato:", result.formato);
  if (result.formato === "extrato-mensal") console.log("colaboradores:", result.colaboradores.length);
}
main();
