-- Fase 7E.3: Férias manuais da Cesta da competência e dias de Férias importados (aprovados) — aditiva e nullable.
-- Lançamentos anteriores ficam NULL (sem Férias manuais / importado não registrado); nada é recalculado.
ALTER TABLE "BasicBasketAllocation" ADD COLUMN "manualVacationDays" INTEGER,
ADD COLUMN "importedVacationDays" INTEGER;
