// Contratos de EXIBIÇÃO da Cesta Básica (formato que as APIs atuais já devolvem). Sem regra de negócio.
export type BasicBasketEntity = { id: string; cnpj: string | null; tradeName: string; legalName: string; activityArea: string; locality: string };
export type BasicBasketAllocationRow = {
  id: string; employeeId: string | null; employeeName: string; company: string; companyId: string | null; department: string | null; costCenter: string | null;
  admissionDate: string | null; referenceCalculationDays: number; retroactiveDays: number; retroactiveEligible: boolean; driverBonus: string; agreementAmount: string;
  monthlyBasketAmount: string; currentCalculationDays: number; currentBasketDays: number; basketAmount: string; retroactiveAmount: string; amount: string; observation: string | null;
  currentVacationDays: number; currentUnjustifiedAbsence: boolean; currentPayableDays: number; retroactiveVacationDays: number; retroactiveUnjustifiedAbsence: boolean; retroactivePayableDays: number; pointMirrorImportId: string | null;
  // Fase 7E.3: Férias manuais informadas no lançamento (null = Espelho) e Férias aprovadas do Espelho antes do override.
  manualVacationDays: number | null; importedVacationDays: number | null;
};
export type BasicBasketMapData = { id: string; version: number; previousPaymentDate: string; paymentDate: string; daysInMonth: number; totalAmount: string; administrativeEntity: BasicBasketEntity; financialRecord: { identifier: string; grossAmount: string } | null; allocations: BasicBasketAllocationRow[] };
