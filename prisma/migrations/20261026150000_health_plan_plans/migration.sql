-- Plano de Saude: nomes dos planos (resumo do PDF) na fatura. Aditiva; faturas anteriores ficam com lista vazia.
ALTER TABLE "HealthPlanInvoice" ADD COLUMN "plans" JSONB NOT NULL DEFAULT '[]';
