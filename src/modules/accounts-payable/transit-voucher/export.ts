import "server-only";
import { buildTransitVoucherWorkbook, type TransitVoucherWorkbookMap } from "./workbook";

export async function exportTransitVoucherMap(map: TransitVoucherWorkbookMap) {
  return buildTransitVoucherWorkbook(map).xlsx.writeBuffer();
}
