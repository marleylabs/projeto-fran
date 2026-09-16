CREATE TYPE "EntryOrigin" AS ENUM ('UPLOAD', 'MANUAL');

ALTER TABLE "FoodEmployee"
ADD COLUMN "jobTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN "costCenter" TEXT NOT NULL DEFAULT '';

ALTER TABLE "FoodMealOccurrence"
ADD COLUMN "origin" "EntryOrigin" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN "createdByUserId" TEXT;

ALTER TABLE "TransitVoucherAllocation"
ADD COLUMN "origin" "EntryOrigin" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "TransitVoucherAllocation_employeeId_idx" ON "TransitVoucherAllocation"("employeeId");
ALTER TABLE "TransitVoucherAllocation" ADD CONSTRAINT "TransitVoucherAllocation_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
