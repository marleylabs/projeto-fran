-- Plano de Saude: competencia, fatura (PDF da operadora = obrigacao) e alocacao por titular. Aditiva.

-- CreateTable
CREATE TABLE "HealthPlanCompetence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPlanCompetence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPlanInvoice" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "administrativeEntityId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "financialRecordId" TEXT,
    "fileName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "obligation" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "dueDate" DATE,
    "contracts" JSONB NOT NULL,
    "grossAmount" DECIMAL(19,4) NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "holderCount" INTEGER NOT NULL,
    "beneficiaryCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,

    CONSTRAINT "HealthPlanInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPlanAllocation" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "administrativeEntityId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "holderCpf" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyId" TEXT,
    "department" TEXT,
    "costCenter" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "beneficiaryCount" INTEGER NOT NULL,
    "beneficiaries" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPlanAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPlanCompetence_year_month_key" ON "HealthPlanCompetence"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPlanInvoice_financialRecordId_key" ON "HealthPlanInvoice"("financialRecordId");

-- CreateIndex
CREATE INDEX "HealthPlanInvoice_competenceId_administrativeEntityId_idx" ON "HealthPlanInvoice"("competenceId", "administrativeEntityId");

-- CreateIndex
CREATE INDEX "HealthPlanInvoice_obligation_idx" ON "HealthPlanInvoice"("obligation");

-- CreateIndex
CREATE INDEX "HealthPlanAllocation_invoiceId_idx" ON "HealthPlanAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "HealthPlanAllocation_employeeId_idx" ON "HealthPlanAllocation"("employeeId");

-- CreateIndex
CREATE INDEX "HealthPlanAllocation_competenceId_administrativeEntityId_idx" ON "HealthPlanAllocation"("competenceId", "administrativeEntityId");

-- AddForeignKey
ALTER TABLE "HealthPlanInvoice" ADD CONSTRAINT "HealthPlanInvoice_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "HealthPlanCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanInvoice" ADD CONSTRAINT "HealthPlanInvoice_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanInvoice" ADD CONSTRAINT "HealthPlanInvoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanInvoice" ADD CONSTRAINT "HealthPlanInvoice_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanInvoice" ADD CONSTRAINT "HealthPlanInvoice_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanAllocation" ADD CONSTRAINT "HealthPlanAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HealthPlanInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanAllocation" ADD CONSTRAINT "HealthPlanAllocation_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "HealthPlanCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanAllocation" ADD CONSTRAINT "HealthPlanAllocation_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanAllocation" ADD CONSTRAINT "HealthPlanAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlanAllocation" ADD CONSTRAINT "HealthPlanAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "FoodBatch_competenceId_locality_administrativeEntityId_cycle_cu" RENAME TO "FoodBatch_competenceId_locality_administrativeEntityId_cycl_idx";

-- RenameIndex
ALTER INDEX "FoodBatch_competenceId_locality_administrativeEntityId_cycle_ve" RENAME TO "FoodBatch_competenceId_locality_administrativeEntityId_cycl_key";

-- RenameIndex
ALTER INDEX "FoodUnitPriceConfig_active_locality_administrativeEntityId_effe" RENAME TO "FoodUnitPriceConfig_active_locality_administrativeEntityId__idx";

-- RenameIndex
ALTER INDEX "TransitVoucherAllocation_competenceId_administrativeEntityId_id" RENAME TO "TransitVoucherAllocation_competenceId_administrativeEntityI_idx";

-- RenameIndex
ALTER INDEX "TransitVoucherMap_competenceId_administrativeEntityId_current_i" RENAME TO "TransitVoucherMap_competenceId_administrativeEntityId_curre_idx";

-- RenameIndex
ALTER INDEX "TransitVoucherMap_competenceId_administrativeEntityId_version_k" RENAME TO "TransitVoucherMap_competenceId_administrativeEntityId_versi_key";

