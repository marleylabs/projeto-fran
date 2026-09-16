ALTER TABLE "FoodBatch" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "FoodBatch_competenceId_locality_administrativeEntityId_version_key";
DROP INDEX "FoodBatch_competenceId_locality_administrativeEntityId_current_idx";

CREATE UNIQUE INDEX "FoodBatch_competenceId_locality_administrativeEntityId_cycle_version_key"
ON "FoodBatch"("competenceId", "locality", "administrativeEntityId", "cycle", "version");

CREATE INDEX "FoodBatch_competenceId_locality_administrativeEntityId_cycle_current_idx"
ON "FoodBatch"("competenceId", "locality", "administrativeEntityId", "cycle", "current");

ALTER TABLE "FoodBatch" ADD CONSTRAINT "FoodBatch_cycle_check"
CHECK ("cycle" IN (0, 1, 2));
