import "server-only";
import { buildBreakfastWorkbook, type BreakfastWorkbookMap } from "./workbook";

export async function exportBreakfastMap(map: BreakfastWorkbookMap) {
  return buildBreakfastWorkbook(map).xlsx.writeBuffer();
}
