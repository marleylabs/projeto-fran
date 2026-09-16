DROP INDEX "FoodBatch_competenceId_locality_version_key";
DROP INDEX "FoodBatch_competenceId_locality_current_idx";

CREATE UNIQUE INDEX "FoodBatch_competenceId_locality_administrativeEntityId_version_key"
ON "FoodBatch"("competenceId", "locality", "administrativeEntityId", "version");
CREATE INDEX "FoodBatch_competenceId_locality_administrativeEntityId_current_idx"
ON "FoodBatch"("competenceId", "locality", "administrativeEntityId", "current");

ALTER TABLE "FoodAllocation" ADD COLUMN "competenceId" TEXT;
ALTER TABLE "FoodAllocation" ADD COLUMN "administrativeEntityId" TEXT;
ALTER TABLE "FoodAllocation" ADD COLUMN "unitPrice" DECIMAL(19,4);

UPDATE "FoodAllocation" a SET
  "competenceId" = b."competenceId",
  "administrativeEntityId" = b."administrativeEntityId",
  "unitPrice" = b."unitPrice"
FROM "FoodBatch" b WHERE b.id = a."batchId";

ALTER TABLE "FoodAllocation" ALTER COLUMN "competenceId" SET NOT NULL;
ALTER TABLE "FoodAllocation" ALTER COLUMN "administrativeEntityId" SET NOT NULL;
ALTER TABLE "FoodAllocation" ALTER COLUMN "unitPrice" SET NOT NULL;
ALTER TABLE "FoodAllocation" ADD CONSTRAINT "FoodAllocation_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "FoodCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodAllocation" ADD CONSTRAINT "FoodAllocation_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FoodAllocation_competenceId_locality_administrativeEntityId_idx" ON "FoodAllocation"("competenceId", "locality", "administrativeEntityId");

DELETE FROM "FoodUnitPriceConfig" WHERE "administrativeEntityId" IS NULL;
ALTER TABLE "FoodUnitPriceConfig" ALTER COLUMN "administrativeEntityId" SET NOT NULL;
