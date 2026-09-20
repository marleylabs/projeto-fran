-- CreateEnum
CREATE TYPE "TransitObservationType" AS ENUM ('VACATION', 'OTHER');

-- AlterTable
ALTER TABLE "TransitVoucherAllocation" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "dailyPassageQuantity" INTEGER,
ADD COLUMN     "fareUnitPrice" DECIMAL(19,4),
ADD COLUMN     "observationDetails" TEXT,
ADD COLUMN     "observationType" "TransitObservationType",
ADD COLUMN     "passageDiscount" INTEGER,
ADD COLUMN     "passagesToReceive" INTEGER,
ADD COLUMN     "previousPassageDifference" INTEGER,
ADD COLUMN     "workingDays" INTEGER;

-- AlterTable
ALTER TABLE "TransitVoucherCompetence" ADD COLUMN     "fareUnitPrice" DECIMAL(19,4);

-- CreateTable
CREATE TABLE "TransitVoucherHoliday" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitVoucherHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitVoucherEmployeeConfig" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dailyPassageQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitVoucherEmployeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransitVoucherHoliday_competenceId_date_key" ON "TransitVoucherHoliday"("competenceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TransitVoucherEmployeeConfig_employeeId_key" ON "TransitVoucherEmployeeConfig"("employeeId");

-- AddForeignKey
ALTER TABLE "TransitVoucherAllocation" ADD CONSTRAINT "TransitVoucherAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitVoucherHoliday" ADD CONSTRAINT "TransitVoucherHoliday_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "TransitVoucherCompetence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitVoucherHoliday" ADD CONSTRAINT "TransitVoucherHoliday_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitVoucherEmployeeConfig" ADD CONSTRAINT "TransitVoucherEmployeeConfig_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
