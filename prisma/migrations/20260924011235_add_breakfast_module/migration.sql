-- CreateEnum
CREATE TYPE "BreakfastObservationType" AS ENUM ('RETROACTIVE', 'OTHER');

-- CreateTable
CREATE TABLE "BreakfastCompetence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "unitPrice" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakfastCompetence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakfastMap" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "administrativeEntityId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "financialRecordId" TEXT,
    "version" INTEGER NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "status" "FoodBatchStatus" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "holidaysSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,

    CONSTRAINT "BreakfastMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakfastAllocation" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "administrativeEntityId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyId" TEXT,
    "department" TEXT,
    "costCenter" TEXT,
    "workingDays" INTEGER,
    "baseQuantity" INTEGER,
    "extraQuantity" INTEGER,
    "finalQuantity" INTEGER,
    "unitPrice" DECIMAL(19,4),
    "amount" DECIMAL(19,4) NOT NULL,
    "observationType" "BreakfastObservationType",
    "observationDetails" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "BreakfastAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakfastHoliday" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakfastHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakfastEmployeeConfig" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "defaultCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakfastEmployeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreakfastCompetence_year_month_key" ON "BreakfastCompetence"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BreakfastMap_financialRecordId_key" ON "BreakfastMap"("financialRecordId");

-- CreateIndex
CREATE INDEX "BreakfastMap_competenceId_administrativeEntityId_current_idx" ON "BreakfastMap"("competenceId", "administrativeEntityId", "current");

-- CreateIndex
CREATE UNIQUE INDEX "BreakfastMap_competenceId_administrativeEntityId_version_key" ON "BreakfastMap"("competenceId", "administrativeEntityId", "version");

-- CreateIndex
CREATE INDEX "BreakfastAllocation_mapId_deletedAt_idx" ON "BreakfastAllocation"("mapId", "deletedAt");

-- CreateIndex
CREATE INDEX "BreakfastAllocation_mapId_company_department_idx" ON "BreakfastAllocation"("mapId", "company", "department");

-- CreateIndex
CREATE INDEX "BreakfastAllocation_employeeId_idx" ON "BreakfastAllocation"("employeeId");

-- CreateIndex
CREATE INDEX "BreakfastAllocation_competenceId_administrativeEntityId_idx" ON "BreakfastAllocation"("competenceId", "administrativeEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "BreakfastHoliday_competenceId_date_key" ON "BreakfastHoliday"("competenceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BreakfastEmployeeConfig_employeeId_key" ON "BreakfastEmployeeConfig"("employeeId");

-- CreateIndex
CREATE INDEX "BreakfastEmployeeConfig_defaultCompanyId_idx" ON "BreakfastEmployeeConfig"("defaultCompanyId");

-- AddForeignKey
ALTER TABLE "BreakfastMap" ADD CONSTRAINT "BreakfastMap_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "BreakfastCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastMap" ADD CONSTRAINT "BreakfastMap_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastMap" ADD CONSTRAINT "BreakfastMap_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastMap" ADD CONSTRAINT "BreakfastMap_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastMap" ADD CONSTRAINT "BreakfastMap_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastAllocation" ADD CONSTRAINT "BreakfastAllocation_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "BreakfastMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastAllocation" ADD CONSTRAINT "BreakfastAllocation_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "BreakfastCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastAllocation" ADD CONSTRAINT "BreakfastAllocation_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastAllocation" ADD CONSTRAINT "BreakfastAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastAllocation" ADD CONSTRAINT "BreakfastAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastAllocation" ADD CONSTRAINT "BreakfastAllocation_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastHoliday" ADD CONSTRAINT "BreakfastHoliday_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "BreakfastCompetence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastHoliday" ADD CONSTRAINT "BreakfastHoliday_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastEmployeeConfig" ADD CONSTRAINT "BreakfastEmployeeConfig_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakfastEmployeeConfig" ADD CONSTRAINT "BreakfastEmployeeConfig_defaultCompanyId_fkey" FOREIGN KEY ("defaultCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
