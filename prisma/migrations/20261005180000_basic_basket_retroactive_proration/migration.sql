-- Cesta Básica: Retroativo PROPORCIONAL ao ciclo (substitui a regra binária "D-15").
-- Migration ADITIVA (nova, não edita 20261005150000_add_basic_basket, que já estava aplicada no banco
-- local com dados de teste): adiciona os snapshots de auditoria do ciclo e os preenche para as linhas
-- existentes com a mesma regra do código, depois torna as colunas obrigatórias.
--   previousPaymentDate = 2ª quarta-feira da competência anterior
--   accrualPeriodDays   = (pagamento atual − 1) − (pagamento anterior + 1) + 1
--   retroactiveDays     = dias de max(admissão, pagamento anterior + 1) até (pagamento atual − 1);
--                         0 sem admissão, admissão <= pagamento anterior ou >= pagamento atual
-- Valores monetários já gravados NÃO são recalculados aqui (nada muda em silêncio no histórico).

ALTER TABLE "BasicBasketMap" ADD COLUMN "previousPaymentDate" DATE;

UPDATE "BasicBasketMap" m
SET "previousPaymentDate" = s.first_day + ((3 - EXTRACT(DOW FROM s.first_day)::int + 7) % 7) + 7
FROM (
  SELECT c.id, (make_date(c.year, c.month, 1) - INTERVAL '1 month')::date AS first_day
  FROM "BasicBasketCompetence" c
) s
WHERE s.id = m."competenceId";

ALTER TABLE "BasicBasketMap" ALTER COLUMN "previousPaymentDate" SET NOT NULL;

ALTER TABLE "BasicBasketAllocation" ADD COLUMN "accrualPeriodDays" INTEGER,
ADD COLUMN "retroactiveDays" INTEGER;

UPDATE "BasicBasketAllocation" a
SET "accrualPeriodDays" = m."paymentDate" - m."previousPaymentDate" - 1,
    "retroactiveDays" = CASE
      WHEN a."admissionDate" IS NULL OR a."admissionDate" <= m."previousPaymentDate" OR a."admissionDate" >= m."paymentDate" THEN 0
      ELSE m."paymentDate" - GREATEST(a."admissionDate", m."previousPaymentDate" + 1)
    END
FROM "BasicBasketMap" m
WHERE m.id = a."mapId";

ALTER TABLE "BasicBasketAllocation" ALTER COLUMN "accrualPeriodDays" SET NOT NULL,
ALTER COLUMN "retroactiveDays" SET NOT NULL;
