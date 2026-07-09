import { readFile } from "fs/promises";
import { parsePayrollPdfAny } from "../src/lib/parser/router";

async function main() {
  const buf = await readFile("../FOLHAD_2.PDF");
  const result = await parsePayrollPdfAny(buf);
  console.log("formato:", result.formato);
  if (result.formato === "extrato-mensal") console.log("colaboradores:", result.colaboradores.length);
}
main();
