-- CreateEnum
CREATE TYPE "ValidationDecision" AS ENUM ('VALIDATED', 'REJECTED', 'CORRECTION_REQUESTED');

-- CreateTable
CREATE TABLE "DocumentValidationReview" (
    "id" TEXT NOT NULL,
    "financialRecordId" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "decision" "ValidationDecision" NOT NULL,
    "extractedSnapshot" JSONB NOT NULL,
    "correctedData" JSONB NOT NULL,
    "lowConfidenceAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentValidationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentValidationField" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "extractedValue" JSONB,
    "finalValue" JSONB,
    "confidence" DECIMAL(5,4),
    "changed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DocumentValidationField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentValidationReview_financialRecordId_createdAt_idx" ON "DocumentValidationReview"("financialRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentValidationReview_reviewerUserId_createdAt_idx" ON "DocumentValidationReview"("reviewerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentValidationField_reviewId_fieldKey_key" ON "DocumentValidationField"("reviewId", "fieldKey");

-- AddForeignKey
ALTER TABLE "DocumentValidationReview" ADD CONSTRAINT "DocumentValidationReview_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentValidationReview" ADD CONSTRAINT "DocumentValidationReview_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "DocumentExtraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentValidationReview" ADD CONSTRAINT "DocumentValidationReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentValidationField" ADD CONSTRAINT "DocumentValidationField_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "DocumentValidationReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
