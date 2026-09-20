-- CreateTable
CREATE TABLE "TrainingProposal" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL,
    "proposalDate" TIMESTAMP(3),
    "validityDays" INTEGER,
    "clientName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sourceItemId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "trainingType" TEXT,
    "duration" TEXT,
    "modality" TEXT NOT NULL,
    "attendanceType" TEXT NOT NULL,
    "additionalStudentPrice" DECIMAL(19,4) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "totalPrice" DECIMAL(19,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingProposal_supplierId_idx" ON "TrainingProposal"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProposal_supplierId_proposalNumber_key" ON "TrainingProposal"("supplierId", "proposalNumber");

-- CreateIndex
CREATE INDEX "Training_supplierId_idx" ON "Training"("supplierId");

-- CreateIndex
CREATE INDEX "Training_proposalId_idx" ON "Training"("proposalId");

-- CreateIndex
CREATE INDEX "Training_modality_attendanceType_idx" ON "Training"("modality", "attendanceType");

-- CreateIndex
CREATE UNIQUE INDEX "Training_supplierId_proposalId_sourceItemId_key" ON "Training"("supplierId", "proposalId", "sourceItemId");

-- AddForeignKey
ALTER TABLE "TrainingProposal" ADD CONSTRAINT "TrainingProposal_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "AdministrativeEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TrainingProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: permissões do módulo de Treinamentos, mesmo padrão de master-data.read/manage.
INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm_training_read', 'training.read', 'Consultar catálogo de treinamentos'),
  ('perm_training_manage', 'training.manage', 'Importar, editar e ativar/inativar treinamentos');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission" WHERE "key" IN ('training.read', 'training.manage');

INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role_analyst', 'perm_training_read'),
  ('role_finance', 'perm_training_read'),
  ('role_controller', 'perm_training_read');
