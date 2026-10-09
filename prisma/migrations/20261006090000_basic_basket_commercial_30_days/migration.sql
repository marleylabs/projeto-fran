-- Cesta Básica: base financeira passa a ser o MÊS COMERCIAL de 30 dias (Cesta da competência e Retroativo),
-- independentemente dos dias reais do mês (que continuam só no calendário: BasicBasketMap.daysInMonth).
-- Migration NOVA e não destrutiva:
--   1) trava de segurança: se existir linha PROPORCIONAL (Cesta parcial ou Retroativo), aborta — o valor em
--      dinheiro calculado na base antiga teria de ser revisto caso a caso (nada de UPDATE financeiro cego);
--   2) renomeia as bases para nomes sem ambiguidade (eram "dias do mês"; agora são "dias de cálculo"):
--        currentMonthDays   → currentCalculationDays
--        referenceMonthDays → referenceCalculationDays
--   3) backfill SÓ de metadados das linhas de mês completo (ou sem Cesta): bases = 30; mês completo = 30 dias.
-- Nenhum valor monetário é alterado (basketAmount/retroactiveAmount/amount/totais/FinancialRecord ficam como estão).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BasicBasketAllocation"
    WHERE "currentBasketDays" NOT IN (0, "currentMonthDays") OR "retroactiveDays" > 0
  ) THEN
    RAISE EXCEPTION 'Cesta Básica: há lançamentos proporcionais calculados na base antiga; revise-os antes de migrar para a base de 30 dias.';
  END IF;
END $$;

ALTER TABLE "BasicBasketAllocation" RENAME COLUMN "currentMonthDays" TO "currentCalculationDays";
ALTER TABLE "BasicBasketAllocation" RENAME COLUMN "referenceMonthDays" TO "referenceCalculationDays";

UPDATE "BasicBasketAllocation"
SET "currentBasketDays" = CASE WHEN "currentBasketDays" = "currentCalculationDays" THEN 30 ELSE 0 END,
    "currentCalculationDays" = 30,
    "referenceCalculationDays" = 30;
