// Feriados do Vale Transporte: a fonte de feriados nacionais e a regra de merge com os
// feriados manuais são compartilhadas com outros módulos (Café da Manhã, futuros) em
// @/modules/shared/holidays. Este arquivo reexporta com os nomes já usados neste módulo,
// para não quebrar os imports existentes (server, testes, UI).
export { easterSunday, getBrazilianNationalHolidays, toHolidaySnapshot } from "@/modules/shared/holidays";
export type { HolidaySource, HolidayEntry, EffectiveHoliday, HolidaySnapshotEntry } from "@/modules/shared/holidays";
import { getEffectiveHolidays } from "@/modules/shared/holidays";

export const getEffectiveTransitVoucherHolidays = getEffectiveHolidays;
