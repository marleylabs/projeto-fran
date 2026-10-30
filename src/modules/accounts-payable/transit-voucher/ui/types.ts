// Tipos de EXIBIÇÃO do Vale Transporte (formato devolvido pelas APIs e estado de digitação da tela). Sem regra.
import type { Holiday } from "@/components/allocation/CompetenceHolidays";
import type { TransitObservationKind } from "../calculations";

/** Cadastro da obrigação (fornecedor) de /api/administrative-entities; a página só lista os que aceitam MA. */
export type TransitEntity = { id: string; cnpj: string | null; tradeName: string; legalName: string; locality: string };
/** Resposta de GET .../transit-voucher/context (getTransitVoucherContext): tarifa vigente, feriados e contagem de dias. */
export type TransitContext ={ year: number; month: number; fareUnitPrice: string; fareDefined: boolean; holidays: Holiday[]; weekdays: number; holidaysInMonth: number; holidaysOnWeekdays: number; workingDays: number };
/**
 * Alocação salva (decimais como texto). Campos de passagem/tarifa/dias úteis são snapshots do lançamento; ficam null
 * em linhas importadas pelo fluxo legado (e aí não há "Corrigir").
 */
export type TransitAllocationRow = {
  id: string; employeeId: string | null; company: string; companyId?: string | null; employeeName: string; department: string | null; costCenter: string | null;
  amount: string; previousPassageDifference: number | null; passageDiscount: number | null; dailyPassageQuantity: number | null; passagesToReceive: number | null; days: string | null; workingDays: number | null; fareUnitPrice: string | null;
  observationType: TransitObservationKind | null; observationDetails: string | null;
};
/** Mapa vigente (um lançamento/versão por fornecedor) com a obrigação vinculada, como vem de GET .../transit-voucher. */
export type TransitMapData = { id: string; version: number; status: string; totalAmount: string; administrativeEntity: TransitEntity; financialRecord: { identifier: string; grossAmount?: string } | null; allocations: TransitAllocationRow[] };
/** Estado de digitação de uma linha do Preenchimento (tudo texto; a página converte e valida antes de enviar). */
export type TransitEntryValue ={ companyText: string; companyId: string; qty: string; diff: string; discount: string; obsType: "" | TransitObservationKind; obsDetails: string };
/** Base histórica exibida (dias úteis e tarifa do mapa ou, sem mapa, da competência). */
export type TransitBase = { workingDays: number | null; fareUnitPrice: string | null };
