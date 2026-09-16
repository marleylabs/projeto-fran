import { mkdir, writeFile } from "node:fs/promises";
import { generateTransitVoucherTemplate } from "../src/modules/accounts-payable/transit-voucher/templates";

const outputDirectory = "outputs/transit-voucher-template-validation";
async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/Mascara_Vale_Transporte.xlsx`, await generateTransitVoucherTemplate());
}
void main();
