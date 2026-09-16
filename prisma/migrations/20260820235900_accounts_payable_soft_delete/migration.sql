ALTER TABLE "FoodBatch" ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledByUserId" TEXT, ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "FoodMealOccurrence" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedByUserId" TEXT, ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "TransitVoucherMap" ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledByUserId" TEXT, ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "TransitVoucherAllocation" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedByUserId" TEXT, ADD COLUMN "deletionReason" TEXT;

ALTER TABLE "FoodBatch" ADD CONSTRAINT "FoodBatch_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodMealOccurrence" ADD CONSTRAINT "FoodMealOccurrence_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherMap" ADD CONSTRAINT "TransitVoucherMap_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitVoucherAllocation" ADD CONSTRAINT "TransitVoucherAllocation_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FoodMealOccurrence_batchId_deletedAt_idx" ON "FoodMealOccurrence"("batchId", "deletedAt");
CREATE INDEX "TransitVoucherAllocation_mapId_deletedAt_idx" ON "TransitVoucherAllocation"("mapId", "deletedAt");

INSERT INTO "Permission" ("id", "key", "description") VALUES ('perm_fin_records_delete', 'financial-records.delete', 'Cancelar registros de contas a pagar');
INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ('role_admin', 'perm_fin_records_delete'), ('role_analyst', 'perm_fin_records_delete');
