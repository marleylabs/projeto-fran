ALTER TABLE "FinancialRecord" ADD COLUMN "administrativeEntityId" TEXT NOT NULL;

CREATE INDEX "FinancialRecord_administrativeEntityId_idx" ON "FinancialRecord"("administrativeEntityId");

ALTER TABLE "FinancialRecord"
ADD CONSTRAINT "FinancialRecord_administrativeEntityId_fkey"
FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
