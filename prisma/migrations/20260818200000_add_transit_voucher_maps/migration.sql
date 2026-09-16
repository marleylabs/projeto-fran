CREATE TABLE "TransitVoucherCompetence" (
  "id" TEXT NOT NULL, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransitVoucherCompetence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TransitVoucherMap" (
  "id" TEXT NOT NULL, "competenceId" TEXT NOT NULL, "administrativeEntityId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL, "financialRecordId" TEXT, "locality" VARCHAR(10) NOT NULL DEFAULT 'MA',
  "version" INTEGER NOT NULL, "current" BOOLEAN NOT NULL DEFAULT true, "status" "FoodBatchStatus" NOT NULL,
  "originalName" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL, "totalRows" INTEGER NOT NULL, "validRows" INTEGER NOT NULL, "invalidRows" INTEGER NOT NULL,
  "totalAmount" DECIMAL(19,4) NOT NULL, "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransitVoucherMap_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TransitVoucherAllocation" (
  "id" TEXT NOT NULL, "mapId" TEXT NOT NULL, "competenceId" TEXT NOT NULL, "administrativeEntityId" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL, "sourceIdentifier" TEXT, "employeeName" TEXT NOT NULL, "department" TEXT,
  "locality" VARCHAR(10) NOT NULL DEFAULT 'MA', "amount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TransitVoucherAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TransitVoucherIssue" (
  "id" TEXT NOT NULL, "mapId" TEXT NOT NULL, "sourceRow" INTEGER, "employeeName" TEXT, "code" TEXT NOT NULL,
  "message" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransitVoucherIssue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransitVoucherCompetence_year_month_key" ON "TransitVoucherCompetence"("year", "month");
CREATE UNIQUE INDEX "TransitVoucherMap_financialRecordId_key" ON "TransitVoucherMap"("financialRecordId");
CREATE UNIQUE INDEX "TransitVoucherMap_storageKey_key" ON "TransitVoucherMap"("storageKey");
CREATE UNIQUE INDEX "TransitVoucherMap_competenceId_administrativeEntityId_version_key" ON "TransitVoucherMap"("competenceId", "administrativeEntityId", "version");
CREATE INDEX "TransitVoucherMap_competenceId_administrativeEntityId_current_idx" ON "TransitVoucherMap"("competenceId", "administrativeEntityId", "current");
CREATE INDEX "TransitVoucherAllocation_mapId_employeeName_idx" ON "TransitVoucherAllocation"("mapId", "employeeName");
CREATE INDEX "TransitVoucherAllocation_competenceId_administrativeEntityId_idx" ON "TransitVoucherAllocation"("competenceId", "administrativeEntityId");
CREATE INDEX "TransitVoucherIssue_mapId_sourceRow_idx" ON "TransitVoucherIssue"("mapId", "sourceRow");
ALTER TABLE "TransitVoucherMap" ADD CONSTRAINT "TransitVoucherMap_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "TransitVoucherCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherMap" ADD CONSTRAINT "TransitVoucherMap_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherMap" ADD CONSTRAINT "TransitVoucherMap_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherMap" ADD CONSTRAINT "TransitVoucherMap_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherAllocation" ADD CONSTRAINT "TransitVoucherAllocation_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "TransitVoucherMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherAllocation" ADD CONSTRAINT "TransitVoucherAllocation_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "TransitVoucherCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherAllocation" ADD CONSTRAINT "TransitVoucherAllocation_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherIssue" ADD CONSTRAINT "TransitVoucherIssue_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "TransitVoucherMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
