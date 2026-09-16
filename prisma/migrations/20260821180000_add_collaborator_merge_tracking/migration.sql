ALTER TABLE "FoodEmployee" ADD COLUMN "mergedIntoId" TEXT;
CREATE INDEX "FoodEmployee_mergedIntoId_idx" ON "FoodEmployee"("mergedIntoId");
ALTER TABLE "FoodEmployee" ADD CONSTRAINT "FoodEmployee_mergedIntoId_fkey"
FOREIGN KEY ("mergedIntoId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
