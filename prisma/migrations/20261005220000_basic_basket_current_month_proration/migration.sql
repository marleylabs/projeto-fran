-- Cesta Básica: a Cesta da COMPETÊNCIA passa a ser proporcional à admissão dentro do próprio mês
-- (admitido até o pagamento recebe mensal × dias da admissão ao fim do mês ÷ dias do mês; após o pagamento,
-- 0 nesta competência). Separa o valor MENSAL (configuração) do valor PAGO. Migration NOVA e ADITIVA:
--   monthlyBasketAmount = valor mensal cheio usado (snapshot)
--   currentMonthDays    = dias totais da competência
--   currentBasketDays   = dias com direito à Cesta na competência
-- basketAmount continua existindo e passa a significar a Cesta PAGA (o que compõe o Total).
-- Backfill das linhas existentes: o valor mensal = basketAmount já gravado (todas foram lançadas como
-- mês cheio pela regra anterior); dias recalculados pela regra nova SÓ como metadado. Nenhum valor
-- monetário existente é alterado.

ALTER TABLE "BasicBasketAllocation" ADD COLUMN "monthlyBasketAmount" DECIMAL(19,4),
ADD COLUMN "currentMonthDays" INTEGER,
ADD COLUMN "currentBasketDays" INTEGER;

UPDATE "BasicBasketAllocation" a
SET "monthlyBasketAmount" = a."basketAmount",
    "currentMonthDays" = m."daysInMonth",
    "currentBasketDays" = CASE
      WHEN a."admissionDate" IS NULL OR a."admissionDate" <= date_trunc('month', m."paymentDate")::date THEN m."daysInMonth"
      WHEN a."admissionDate" <= m."paymentDate" THEN ((date_trunc('month', m."paymentDate") + INTERVAL '1 month - 1 day')::date - a."admissionDate") + 1
      ELSE 0
    END
FROM "BasicBasketMap" m
WHERE m.id = a."mapId";

ALTER TABLE "BasicBasketAllocation" ALTER COLUMN "monthlyBasketAmount" SET NOT NULL,
ALTER COLUMN "currentMonthDays" SET NOT NULL,
ALTER COLUMN "currentBasketDays" SET NOT NULL;
