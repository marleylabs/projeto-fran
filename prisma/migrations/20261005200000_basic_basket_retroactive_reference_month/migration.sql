-- Cesta Básica: Retroativo de admissão passa a ter como referência o MÊS ANTERIOR à competência
-- (corrige a interpretação "entre pagamentos" de 20261005180000). Migration NOVA e não destrutiva:
--   1) renomeia accrualPeriodDays → referenceMonthDays (o nome antigo ficaria semanticamente errado);
--   2) recalcula SÓ os metadados de auditoria das linhas existentes com a regra nova:
--        referenceMonthDays = dias totais do mês do pagamento anterior (= mês anterior à competência)
--        retroactiveDays    = admissão … último dia desse mês, se pagamento anterior < admissão ≤ último dia; senão 0
-- Nenhum valor monetário é alterado (retroactiveAmount/amount/totais/FinancialRecord ficam como estão).

ALTER TABLE "BasicBasketAllocation" RENAME COLUMN "accrualPeriodDays" TO "referenceMonthDays";

UPDATE "BasicBasketAllocation" a
SET "referenceMonthDays" = EXTRACT(DAY FROM (date_trunc('month', m."previousPaymentDate") + INTERVAL '1 month - 1 day'))::int,
    "retroactiveDays" = CASE
      WHEN a."admissionDate" IS NULL OR a."admissionDate" <= m."previousPaymentDate"
        OR a."admissionDate" > (date_trunc('month', m."previousPaymentDate") + INTERVAL '1 month - 1 day')::date THEN 0
      ELSE ((date_trunc('month', m."previousPaymentDate") + INTERVAL '1 month - 1 day')::date - a."admissionDate") + 1
    END
FROM "BasicBasketMap" m
WHERE m.id = a."mapId";
