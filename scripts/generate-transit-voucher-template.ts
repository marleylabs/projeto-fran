// Gera a máscara (planilha modelo) de Vale Transporte em outputs/transit-voucher-template-validation/
// para conferência manual do layout. Uso: npx tsx scripts/generate-transit-voucher-template.ts.
// O conteúdo vem de generateTransitVoucherTemplate (o mesmo usado pelo download da máscara na aplicação).
import { mkdir, writeFile } from "node:fs/promises";
import { generateTransitVoucherTemplate } from "../src/modules/accounts-payable/transit-voucher/templates";

const outputDirectory = "outputs/transit-voucher-template-validation";
async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/Mascara_Vale_Transporte.xlsx`, await generateTransitVoucherTemplate());
}
void main();
