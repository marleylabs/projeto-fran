CREATE TYPE "FoodOccurrenceMatchMethod" AS ENUM ('UNMATCHED', 'EXACT', 'NORMALIZED', 'ALIAS', 'FUZZY', 'MANUAL');
CREATE TYPE "FoodOccurrenceDisposition" AS ENUM ('VALID', 'DUPLICATE', 'IGNORED');

ALTER TABLE "FoodMealOccurrence"
  ADD COLUMN "matchMethod" "FoodOccurrenceMatchMethod" NOT NULL DEFAULT 'UNMATCHED',
  ADD COLUMN "disposition" "FoodOccurrenceDisposition" NOT NULL DEFAULT 'VALID';

CREATE TABLE "FoodBatchRevision" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "editedByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousTotal" DECIMAL(19,4) NOT NULL,
  "newTotal" DECIMAL(19,4) NOT NULL,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoodBatchRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FoodBatchRevision_batchId_revision_key" ON "FoodBatchRevision"("batchId", "revision");
CREATE INDEX "FoodBatchRevision_batchId_createdAt_idx" ON "FoodBatchRevision"("batchId", "createdAt");
ALTER TABLE "FoodBatchRevision" ADD CONSTRAINT "FoodBatchRevision_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FoodBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodBatchRevision" ADD CONSTRAINT "FoodBatchRevision_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
