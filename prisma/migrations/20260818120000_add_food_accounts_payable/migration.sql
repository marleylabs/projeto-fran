CREATE TYPE "FoodBatchStatus" AS ENUM ('WITH_INCONSISTENCIES', 'READY');

CREATE TABLE "FoodUnitPriceConfig" (
    "id" TEXT NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "locality" VARCHAR(10),
    "administrativeEntityId" TEXT,
    "effectiveYear" INTEGER,
    "effectiveMonth" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodUnitPriceConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodCompetence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodCompetence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodBatch" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "administrativeEntityId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "financialRecordId" TEXT,
    "locality" VARCHAR(10) NOT NULL,
    "version" INTEGER NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "status" "FoodBatchStatus" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodAllocation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "sourceIdentifier" TEXT,
    "employeeName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "locality" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodBatchIssue" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRow" INTEGER,
    "employeeName" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodBatchIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoodCompetence_year_month_key" ON "FoodCompetence"("year", "month");
CREATE INDEX "FoodCompetence_year_month_idx" ON "FoodCompetence"("year", "month");
CREATE UNIQUE INDEX "FoodBatch_financialRecordId_key" ON "FoodBatch"("financialRecordId");
CREATE UNIQUE INDEX "FoodBatch_storageKey_key" ON "FoodBatch"("storageKey");
CREATE UNIQUE INDEX "FoodBatch_competenceId_locality_version_key" ON "FoodBatch"("competenceId", "locality", "version");
CREATE INDEX "FoodBatch_competenceId_locality_current_idx" ON "FoodBatch"("competenceId", "locality", "current");
CREATE INDEX "FoodBatch_administrativeEntityId_idx" ON "FoodBatch"("administrativeEntityId");
CREATE INDEX "FoodAllocation_batchId_department_idx" ON "FoodAllocation"("batchId", "department");
CREATE INDEX "FoodAllocation_batchId_employeeName_idx" ON "FoodAllocation"("batchId", "employeeName");
CREATE INDEX "FoodBatchIssue_batchId_sourceRow_idx" ON "FoodBatchIssue"("batchId", "sourceRow");
CREATE INDEX "FoodUnitPriceConfig_active_locality_administrativeEntityId_effectiveYear_effectiveMonth_idx" ON "FoodUnitPriceConfig"("active", "locality", "administrativeEntityId", "effectiveYear", "effectiveMonth");

ALTER TABLE "FoodUnitPriceConfig" ADD CONSTRAINT "FoodUnitPriceConfig_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodBatch" ADD CONSTRAINT "FoodBatch_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "FoodCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodBatch" ADD CONSTRAINT "FoodBatch_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodBatch" ADD CONSTRAINT "FoodBatch_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodBatch" ADD CONSTRAINT "FoodBatch_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodAllocation" ADD CONSTRAINT "FoodAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FoodBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodBatchIssue" ADD CONSTRAINT "FoodBatchIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FoodBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FoodUnitPriceConfig" ("id", "unitPrice", "active", "createdAt", "updatedAt")
VALUES ('food_default_price_25', 25.0000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
