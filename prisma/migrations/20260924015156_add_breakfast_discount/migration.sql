-- Desconto: quantidade de cafés a retirar do lançamento, específico daquela competência.
-- NUNCA vira configuração padrão do colaborador (BreakfastEmployeeConfig não guarda desconto).
ALTER TABLE "BreakfastAllocation" ADD COLUMN "discountQuantity" INTEGER NOT NULL DEFAULT 0;
