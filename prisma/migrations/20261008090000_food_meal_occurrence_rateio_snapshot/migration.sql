-- Fase 7E.2: snapshot histórico de Centro de Custo e Empresa por refeição da Alimentação, SÓ para agrupar o rateio.
-- Aditiva e nullable: refeições anteriores ficam NULL ("Sem centro de custo" / "Sem empresa") — SEM backfill pelo
-- cadastro atual, que poderia reescrever o histórico.
ALTER TABLE "FoodMealOccurrence" ADD COLUMN "costCenter" TEXT,
ADD COLUMN "companyId" TEXT,
ADD COLUMN "company" TEXT;

-- AddForeignKey
ALTER TABLE "FoodMealOccurrence" ADD CONSTRAINT "FoodMealOccurrence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
