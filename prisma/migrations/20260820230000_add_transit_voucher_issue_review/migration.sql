ALTER TABLE "TransitVoucherIssue"
  ADD COLUMN "rawData" JSONB,
  ADD COLUMN "fieldErrors" JSONB,
  ADD COLUMN "suggestedData" JSONB,
  ADD COLUMN "correctedData" JSONB,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedByUserId" TEXT;

CREATE INDEX "TransitVoucherIssue_mapId_resolvedAt_idx"
  ON "TransitVoucherIssue"("mapId", "resolvedAt");
