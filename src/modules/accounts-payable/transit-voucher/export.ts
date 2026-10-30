import "server-only";
// Serialização do XLSX do Mapa de Vale Transporte. Chamado pela rota
// /api/accounts-payable/transit-voucher/[mapId]/download, que junta os mapas prontos do fornecedor na
// competência num único "map" antes de chamar aqui. A montagem (abas, totais, conferência) fica em workbook.ts.
import { buildTransitVoucherWorkbook, type TransitVoucherWorkbookMap } from "./workbook";

/** Gera o buffer XLSX do mapa. Propaga o erro de inconsistência de totais lançado por buildTransitVoucherWorkbook. */
export async function exportTransitVoucherMap(map: TransitVoucherWorkbookMap) {
  return buildTransitVoucherWorkbook(map).xlsx.writeBuffer();
}
