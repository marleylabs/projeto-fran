-- CreateEnum
CREATE TYPE "ExtractionJobState" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "DocumentExtractionJob" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "state" "ExtractionJobState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "errorStage" TEXT,
    "errorMessage" TEXT,
    "technicalStack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "state" "ExtractionJobState" NOT NULL,
    "engine" TEXT NOT NULL,
    "engineVersion" TEXT,
    "language" TEXT,
    "documentType" TEXT,
    "rawText" TEXT,
    "structuredData" JSONB,
    "fieldConfidences" JSONB,
    "overallConfidence" DECIMAL(5,4),
    "validationResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentExtractionJob_state_availableAt_idx" ON "DocumentExtractionJob"("state", "availableAt");

-- CreateIndex
CREATE INDEX "DocumentExtractionJob_fileId_createdAt_idx" ON "DocumentExtractionJob"("fileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtraction_jobId_key" ON "DocumentExtraction"("jobId");

-- CreateIndex
CREATE INDEX "DocumentExtraction_fileId_createdAt_idx" ON "DocumentExtraction"("fileId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentExtraction_state_createdAt_idx" ON "DocumentExtraction"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentExtractionJob" ADD CONSTRAINT "DocumentExtractionJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FinancialDocumentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocumentExtractionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FinancialDocumentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
