-- Cesta Básica: importação do Espelho de Ponto (Falta Injustificada e Férias). Migration NOVA e ADITIVA:
--   1) tabela BasicBasketPointMirrorImport com SÓ os ajustes processados por colaborador (datas), sem arquivo/CPF;
--   2) snapshots na linha do lançamento: Férias aplicáveis, Falta Injustificada e dias finais pagos, para o mês da
--      competência (Cesta) e para o mês anterior (Retroativo), + vínculo opcional com a importação usada.
-- Backfill das linhas existentes = "sem importação": sem Falta, 0 dias de Férias, dias finais = dias já gravados.
-- Nenhum valor monetário existente é alterado.

CREATE TABLE "BasicBasketPointMirrorImport" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "sourceRows" INTEGER NOT NULL,
    "occurrences" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BasicBasketPointMirrorImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BasicBasketPointMirrorImport_year_month_idx" ON "BasicBasketPointMirrorImport"("year", "month");
CREATE INDEX "BasicBasketPointMirrorImport_createdAt_idx" ON "BasicBasketPointMirrorImport"("createdAt");
ALTER TABLE "BasicBasketPointMirrorImport" ADD CONSTRAINT "BasicBasketPointMirrorImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BasicBasketAllocation" ADD COLUMN "currentVacationDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "currentUnjustifiedAbsence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "currentPayableDays" INTEGER,
ADD COLUMN "retroactiveVacationDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "retroactiveUnjustifiedAbsence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "retroactivePayableDays" INTEGER,
ADD COLUMN "pointMirrorImportId" TEXT;

UPDATE "BasicBasketAllocation" SET "currentPayableDays" = "currentBasketDays", "retroactivePayableDays" = "retroactiveDays";

ALTER TABLE "BasicBasketAllocation" ALTER COLUMN "currentPayableDays" SET NOT NULL,
ALTER COLUMN "retroactivePayableDays" SET NOT NULL;

ALTER TABLE "BasicBasketAllocation" ADD CONSTRAINT "BasicBasketAllocation_pointMirrorImportId_fkey" FOREIGN KEY ("pointMirrorImportId") REFERENCES "BasicBasketPointMirrorImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BasicBasketAllocation_pointMirrorImportId_idx" ON "BasicBasketAllocation"("pointMirrorImportId");