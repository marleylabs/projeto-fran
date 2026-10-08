// Máscara Flash do Café da Manhã. A especificação (cabeçalhos, formatos, validações, soma = lançamento = obrigação)
// é compartilhada com a Cesta Básica em ../shared/flash; aqui ficam os nomes já usados pelo módulo e pelos testes.
export {
  FLASH_HEADERS,
  FLASH_SHEET_NAME,
  FlashExportError as BreakfastFlashExportError,
  buildFlashRows as buildBreakfastFlashRows,
  buildFlashWorkbook as buildBreakfastFlashWorkbook,
  type FlashAllocation as BreakfastFlashAllocation,
  type FlashMap as BreakfastFlashMap,
} from "@/modules/accounts-payable/shared/flash";
