-- CreateEnum
CREATE TYPE "TrainingOrigin" AS ENUM ('IMPORTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "TrainingExpenseStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Training" ADD COLUMN     "origin" "TrainingOrigin" NOT NULL DEFAULT 'IMPORTED',
ALTER COLUMN "proposalId" DROP NOT NULL,
ALTER COLUMN "sourceItemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TrainingExpenseCompetence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingExpenseCompetence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExpense" (
    "id" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "financialRecordId" TEXT,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "baseQuantitySnapshot" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(19,4) NOT NULL,
    "additionalStudentPriceSnapshot" DECIMAL(19,4) NOT NULL,
    "calculatedAmount" DECIMAL(19,4) NOT NULL,
    "finalAmount" DECIMAL(19,4) NOT NULL,
    "adjustmentReason" TEXT,
    "status" "TrainingExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExpenseParticipant" (
    "id" TEXT NOT NULL,
    "trainingExpenseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "costCenter" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingExpenseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExpenseRevision" (
    "id" TEXT NOT NULL,
    "trainingExpenseId" TEXT NOT NULL,
    "editedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousTotal" DECIMAL(19,4) NOT NULL,
    "newTotal" DECIMAL(19,4) NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingExpenseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingExpenseCompetence_year_month_key" ON "TrainingExpenseCompetence"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingExpense_financialRecordId_key" ON "TrainingExpense"("financialRecordId");

-- CreateIndex
CREATE INDEX "TrainingExpense_competenceId_idx" ON "TrainingExpense"("competenceId");

-- CreateIndex
CREATE INDEX "TrainingExpense_supplierId_idx" ON "TrainingExpense"("supplierId");

-- CreateIndex
CREATE INDEX "TrainingExpense_trainingId_idx" ON "TrainingExpense"("trainingId");

-- CreateIndex
CREATE INDEX "TrainingExpense_status_idx" ON "TrainingExpense"("status");

-- CreateIndex
CREATE INDEX "TrainingExpenseParticipant_employeeId_idx" ON "TrainingExpenseParticipant"("employeeId");

-- CreateIndex
CREATE INDEX "TrainingExpenseParticipant_department_idx" ON "TrainingExpenseParticipant"("department");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingExpenseParticipant_trainingExpenseId_employeeId_key" ON "TrainingExpenseParticipant"("trainingExpenseId", "employeeId");

-- CreateIndex
CREATE INDEX "TrainingExpenseRevision_trainingExpenseId_createdAt_idx" ON "TrainingExpenseRevision"("trainingExpenseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingExpenseRevision_trainingExpenseId_revision_key" ON "TrainingExpenseRevision"("trainingExpenseId", "revision");

-- AddForeignKey
ALTER TABLE "TrainingExpense" ADD CONSTRAINT "TrainingExpense_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "TrainingExpenseCompetence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpense" ADD CONSTRAINT "TrainingExpense_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpense" ADD CONSTRAINT "TrainingExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpense" ADD CONSTRAINT "TrainingExpense_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpense" ADD CONSTRAINT "TrainingExpense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpense" ADD CONSTRAINT "TrainingExpense_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpenseParticipant" ADD CONSTRAINT "TrainingExpenseParticipant_trainingExpenseId_fkey" FOREIGN KEY ("trainingExpenseId") REFERENCES "TrainingExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpenseParticipant" ADD CONSTRAINT "TrainingExpenseParticipant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FoodEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpenseRevision" ADD CONSTRAINT "TrainingExpenseRevision_trainingExpenseId_fkey" FOREIGN KEY ("trainingExpenseId") REFERENCES "TrainingExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExpenseRevision" ADD CONSTRAINT "TrainingExpenseRevision_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Garante em nível de banco que um treinamento IMPORTED sempre tenha
-- proposalId+sourceItemId, e um MANUAL nunca precise deles — em vez de
-- confiar só na validação da aplicação.
ALTER TABLE "Training" ADD CONSTRAINT "training_origin_consistency" CHECK (
  ("origin" = 'IMPORTED' AND "proposalId" IS NOT NULL AND "sourceItemId" IS NOT NULL)
  OR
  ("origin" = 'MANUAL')
);

-- Garante que TrainingExpense.supplierId nunca divirja de Training.supplierId
-- do treinamento referenciado — mesmo padrão do trigger training_supplier_guard
-- já aplicado para TrainingProposal/Training.
CREATE OR REPLACE FUNCTION training_expense_supplier_matches_training() RETURNS trigger AS $$
DECLARE
  training_supplier_id TEXT;
BEGIN
  SELECT "supplierId" INTO training_supplier_id FROM "Training" WHERE "id" = NEW."trainingId";
  IF training_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Treinamento % não encontrado para o lançamento.', NEW."trainingId";
  END IF;
  IF training_supplier_id <> NEW."supplierId" THEN
    RAISE EXCEPTION 'TrainingExpense.supplierId (%) diverge de Training.supplierId (%) para o treinamento %.',
      NEW."supplierId", training_supplier_id, NEW."trainingId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_expense_supplier_guard
  BEFORE INSERT OR UPDATE OF "supplierId", "trainingId" ON "TrainingExpense"
  FOR EACH ROW
  EXECUTE FUNCTION training_expense_supplier_matches_training();
