-- Cesta Básica (Despesas → Alimentação): domínio próprio, migration ADITIVA — só cria tabelas,
-- índices e FKs novos; nenhuma tabela existente é alterada.
-- (Renomeações de índices antigos que o diff também apontou são drift preexistente e ficaram de fora.)
-- CreateTable
CREATE TABLE "BasicBasketCompetence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasicBasketCompetence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicBasketMap" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "administrativeEntityId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "financialRecordId" TEXT,
    "version" INTEGER NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "status" "FoodBatchStatus" NOT NULL,
    "paymentDate" DATE NOT NULL,
    "daysInMonth" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,

    CONSTRAINT "BasicBasketMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicBasketAllocation" (
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
    "admissionDate" DATE,
    "retroactiveEligible" BOOLEAN NOT NULL DEFAULT false,
    "driverBonus" DECIMAL(19,4) NOT NULL,
    "agreementAmount" DECIMAL(19,4) NOT NULL,
    "basketAmount" DECIMAL(19,4) NOT NULL,
    "retroactiveAmount" DECIMAL(19,4) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "observation" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "BasicBasketAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicBasketEmployeeConfig" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "defaultCompanyId" TEXT,
    "driverBonus" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "agreementAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "basketAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasicBasketEmployeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BasicBasketCompetence_year_month_key" ON "BasicBasketCompetence"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BasicBasketMap_financialRecordId_key" ON "BasicBasketMap"("financialRecordId");

-- CreateIndex
CREATE INDEX "BasicBasketMap_competenceId_administrativeEntityId_current_idx" ON "BasicBasketMap"("competenceId", "administrativeEntityId", "current");

-- CreateIndex
CREATE UNIQUE INDEX "BasicBasketMap_competenceId_administrativeEntityId_version_key" ON "BasicBasketMap"("competenceId", "administrativeEntityId", "version");

-- CreateIndex
CREATE INDEX "BasicBasketAllocation_mapId_deletedAt_idx" ON "BasicBasketAllocation"("mapId", "deletedAt");

-- CreateIndex
CREATE INDEX "BasicBasketAllocation_employeeId_idx" ON "BasicBasketAllocation"("employeeId");

-- CreateIndex
CREATE INDEX "BasicBasketAllocation_competenceId_administrativeEntityId_idx" ON "BasicBasketAllocation"("competenceId", "administrativeEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "BasicBasketEmployeeConfig_employeeId_key" ON "BasicBasketEmployeeConfig"("employeeId");

-- CreateIndex
CREATE INDEX "BasicBasketEmployeeConfig_defaultCompanyId_idx" ON "BasicBasketEmployeeConfig"("defaultCompanyId");

-- AddForeignKey
ALTER TABLE "BasicBasketMap" ADD CONSTRAINT "BasicBasketMap_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "BasicBasketCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketMap" ADD CONSTRAINT "BasicBasketMap_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketMap" ADD CONSTRAINT "BasicBasketMap_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketMap" ADD CONSTRAINT "BasicBasketMap_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketMap" ADD CONSTRAINT "BasicBasketMap_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "BasicBasketMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "BasicBasketCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_administrativeEntityId_fkey" FOREIGN KEY ("administrativeEntityId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketEmployeeConfig" ADD CONSTRAINT "BasicBasketEmployeeConfig_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicBasketEmployeeConfig" ADD CONSTRAINT "BasicBasketEmployeeConfig_defaultCompanyId_fkey" FOREIGN KEY ("defaultCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
