-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "empresaChave" TEXT,
ADD COLUMN     "periodoChave" TEXT;

-- CreateIndex
CREATE INDEX "Upload_formato_empresaChave_periodoChave_idx" ON "Upload"("formato", "empresaChave", "periodoChave");
