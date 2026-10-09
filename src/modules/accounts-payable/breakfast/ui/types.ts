// Tipos de EXIBIÇÃO do Café da Manhã (formato devolvido pelas APIs e estado de digitação da tela). Sem regra.
import type { Holiday } from "@/components/allocation/CompetenceHolidays";
import type { BreakfastObservationKind } from "../calculations";

export type BreakfastEntity = { id: string; cnpj: string | null; tradeName: string; legalName: string; activityArea: string; locality: string };
export type BreakfastContext = { year: number; month: number; unitPrice: string; unitPriceDefined: boolean; holidays: Holiday[]; weekdays: number; holidaysInMonth: number; holidaysOnWeekdays: number; workingDays: number };
export type BreakfastAllocationRow = {
  id: string; employeeId: string | null; company: string; companyId?: string | null; employeeName: string; department: string | null; costCenter: string | null;
  amount: string; workingDays: number | null; baseQuantity: number | null; extraQuantity: number | null; discountQuantity: number; finalQuantity: number | null; unitPrice: string | null;
  observationType: BreakfastObservationKind | null; observationDetails: string | null;
};
export type BreakfastMapData = { id: string; version: number; totalAmount: string; administrativeEntity: BreakfastEntity; financialRecord: { identifier: string } | null; allocations: BreakfastAllocationRow[] };
export type BreakfastEntryValue = { companyText: string; companyId: string; extra: string; discount: string; obsType: "" | BreakfastObservationKind; obsDetails: string };
/** Base histórica exibida (dias úteis e valor unitário do mapa ou, sem mapa, da competência). */
export type BreakfastBase = { workingDays: number | null; unitPrice: string | null };
