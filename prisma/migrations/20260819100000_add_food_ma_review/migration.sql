ALTER TYPE "FoodBatchStatus" ADD VALUE 'UNDER_REVIEW' BEFORE 'WITH_INCONSISTENCIES';
CREATE TYPE "FoodOccurrenceValidationStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'CONFIRMED');
CREATE TABLE "FoodEmployee" (
  "id" TEXT NOT NULL, "officialName" TEXT NOT NULL, "normalizedName" TEXT NOT NULL, "department" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FoodEmployee_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FoodEmployeeAlias" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "sourceName" TEXT NOT NULL, "normalizedAlias" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FoodEmployeeAlias_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FoodMealOccurrence" (
  "id" TEXT NOT NULL, "batchId" TEXT NOT NULL, "employeeId" TEXT, "sourceRow" INTEGER NOT NULL,
  "occurredOn" DATE NOT NULL, "receivedName" TEXT NOT NULL, "normalizedReceivedName" TEXT NOT NULL,
  "officialName" TEXT, "receivedDepartment" TEXT NOT NULL, "confirmedDepartment" TEXT,
  "duplicateCandidate" BOOLEAN NOT NULL DEFAULT false, "duplicateConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "included" BOOLEAN NOT NULL DEFAULT true, "validationStatus" "FoodOccurrenceValidationStatus" NOT NULL DEFAULT 'PENDING',
  "unitPrice" DECIMAL(19,4) NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodMealOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FoodEmployee_normalizedName_key" ON "FoodEmployee"("normalizedName");
CREATE INDEX "FoodEmployee_department_active_idx" ON "FoodEmployee"("department", "active");
CREATE UNIQUE INDEX "FoodEmployeeAlias_normalizedAlias_key" ON "FoodEmployeeAlias"("normalizedAlias");
CREATE INDEX "FoodEmployeeAlias_employeeId_idx" ON "FoodEmployeeAlias"("employeeId");
CREATE INDEX "FoodMealOccurrence_batchId_normalizedReceivedName_idx" ON "FoodMealOccurrence"("batchId", "normalizedReceivedName");
CREATE INDEX "FoodMealOccurrence_batchId_occurredOn_employeeId_idx" ON "FoodMealOccurrence"("batchId", "occurredOn", "employeeId");
ALTER TABLE "FoodEmployeeAlias" ADD CONSTRAINT "FoodEmployeeAlias_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodMealOccurrence" ADD CONSTRAINT "FoodMealOccurrence_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FoodBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodMealOccurrence" ADD CONSTRAINT "FoodMealOccurrence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
