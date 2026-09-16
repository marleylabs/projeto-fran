-- CreateEnum
CREATE TYPE "FinancialFileKind" AS ENUM ('INVOICE', 'TAX_INVOICE', 'BOLETO', 'RECEIPT', 'XML', 'SPREADSHEET', 'SUPPORTING', 'OTHER');

-- CreateTable
CREATE TABLE "FinancialDocumentFile" (
    "id" TEXT NOT NULL,
    "financialRecordId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "supersedesFileId" TEXT,
    "kind" "FinancialFileKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialDocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocumentFile_storageKey_key" ON "FinancialDocumentFile"("storageKey");

-- CreateIndex
CREATE INDEX "FinancialDocumentFile_financialRecordId_active_idx" ON "FinancialDocumentFile"("financialRecordId", "active");

-- CreateIndex
CREATE INDEX "FinancialDocumentFile_sha256_idx" ON "FinancialDocumentFile"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocumentFile_financialRecordId_kind_version_key" ON "FinancialDocumentFile"("financialRecordId", "kind", "version");

-- AddForeignKey
ALTER TABLE "FinancialDocumentFile" ADD CONSTRAINT "FinancialDocumentFile_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocumentFile" ADD CONSTRAINT "FinancialDocumentFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocumentFile" ADD CONSTRAINT "FinancialDocumentFile_supersedesFileId_fkey" FOREIGN KEY ("supersedesFileId") REFERENCES "FinancialDocumentFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
