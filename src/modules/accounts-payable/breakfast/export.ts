import "server-only";
import { buildBreakfastWorkbook, type BreakfastWorkbookMap } from "./workbook";

/** Serializa o XLSX do mapa (Buffer) para a rota [mapId]/download; a montagem e as conferências ficam em workbook.ts. */
export async function exportBreakfastMap(map: BreakfastWorkbookMap) {
  return buildBreakfastWorkbook(map).xlsx.writeBuffer();
}
