-- CreateEnum
CREATE TYPE "RecordLifecycleState" AS ENUM ('ACTIVE', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentState" AS ENUM ('PENDING', 'ATTACHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExtractionState" AS ENUM ('NOT_STARTED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ValidationState" AS ENUM ('PENDING', 'IN_REVIEW', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceiptState" AS ENUM ('PENDING', 'ATTACHED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReconciliationState" AS ENUM ('PENDING', 'MATCHED', 'DIVERGENT');

-- CreateEnum
CREATE TYPE "AllocationState" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AccountingState" AS ENUM ('PENDING', 'READY', 'EXPORTED', 'ERROR');

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CostCenter" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LedgerAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FinancialSequence" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "sequenceYear" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "supplierId" TEXT,
    "projectId" TEXT,
    "contractId" TEXT,
    "costCenterId" TEXT,
    "departmentId" TEXT,
    "categoryId" TEXT,
    "ledgerAccountId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "description" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "competenceDate" TIMESTAMP(3),
    "grossAmount" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "withholdingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "lifecycleState" "RecordLifecycleState" NOT NULL DEFAULT 'ACTIVE',
    "documentState" "DocumentState" NOT NULL DEFAULT 'PENDING',
    "extractionState" "ExtractionState" NOT NULL DEFAULT 'NOT_STARTED',
    "validationState" "ValidationState" NOT NULL DEFAULT 'PENDING',
    "approvalState" "ApprovalState" NOT NULL DEFAULT 'PENDING',
    "paymentState" "PaymentState" NOT NULL DEFAULT 'PENDING',
    "receiptState" "ReceiptState" NOT NULL DEFAULT 'PENDING',
    "reconciliationState" "ReconciliationState" NOT NULL DEFAULT 'PENDING',
    "allocationState" "AllocationState" NOT NULL DEFAULT 'PENDING',
    "accountingState" "AccountingState" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRecord_identifier_key" ON "FinancialRecord"("identifier");

-- CreateIndex
CREATE INDEX "FinancialRecord_companyId_dueDate_idx" ON "FinancialRecord"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "FinancialRecord_supplierId_idx" ON "FinancialRecord"("supplierId");

-- CreateIndex
CREATE INDEX "FinancialRecord_paymentState_dueDate_idx" ON "FinancialRecord"("paymentState", "dueDate");

-- CreateIndex
CREATE INDEX "FinancialRecord_approvalState_createdAt_idx" ON "FinancialRecord"("approvalState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRecord_sequenceYear_sequenceNumber_key" ON "FinancialRecord"("sequenceYear", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
