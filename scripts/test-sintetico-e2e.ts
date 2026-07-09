import { readFile } from "fs/promises";
import { parsePayrollPdfAny } from "../src/lib/parser/router";

async function main() {
  const buf = await readFile(process.argv[2]);
  const result = await parsePayrollPdfAny(buf);
  console.log("formato:", result.formato);
  console.log(JSON.stringify(result, null, 2));
}

main();
