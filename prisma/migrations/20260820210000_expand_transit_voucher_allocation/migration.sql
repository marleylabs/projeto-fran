ALTER TABLE "TransitVoucherAllocation"
  ADD COLUMN "employeeId" TEXT,
  ADD COLUMN "company" TEXT NOT NULL DEFAULT 'Não informada',
  ADD COLUMN "originalEmployeeName" TEXT,
  ADD COLUMN "serviceDate" TIMESTAMP(3),
  ADD COLUMN "service" TEXT,
  ADD COLUMN "costCenter" TEXT,
  ADD COLUMN "dailyAmount" DECIMAL(19,4),
  ADD COLUMN "previousMonthDifference" DECIMAL(19,4),
  ADD COLUMN "occasionalDiscounts" DECIMAL(19,4),
  ADD COLUMN "days" DECIMAL(10,2);

CREATE INDEX "TransitVoucherAllocation_mapId_company_department_idx"
  ON "TransitVoucherAllocation"("mapId", "company", "department");
