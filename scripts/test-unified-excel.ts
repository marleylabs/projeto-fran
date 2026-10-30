// Script manual de depuração (somente leitura) da linha unificada de exportação da Folha.
// Lê ../FOLHAD_2.PDF (caminho relativo ao diretório de execução, fora do repositório), extrai com parsePayrollPdf e
// imprime unifiedRowFromColaborador para alguns códigos fixos de colaborador. Não grava nada.
// Atenção: a saída contém dados pessoais e salariais (nome e valores) — não compartilhar.
import { readFile } from "fs/promises";
import { parsePayrollPdf } from "../src/lib/parser/parsePayrollPdf";
import { unifiedRowFromColaborador } from "../src/lib/export/unifiedRow";

async function main() {
  const buf = await readFile("../FOLHAD_2.PDF");
  const result = await parsePayrollPdf(buf);

  for (const codigo of ["41", "83", "76", "32"]) {
    const c = result.colaboradores.find((x) => x.codigo === codigo);
    if (!c) continue;
    console.log("===", c.nome, "===");
    console.log(JSON.stringify(unifiedRowFromColaborador(c), null, 2));
  }
}
main();
