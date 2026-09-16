CREATE TABLE "AdministrativeEntity" (
    "id" TEXT NOT NULL,
    "cnpj" VARCHAR(14),
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "activityArea" TEXT NOT NULL,
    "appliesProjeta" BOOLEAN NOT NULL,
    "appliesBoinga" BOOLEAN NOT NULL,
    "locality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministrativeEntity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdministrativeEntity_cnpj_idx" ON "AdministrativeEntity"("cnpj");
CREATE INDEX "AdministrativeEntity_activityArea_idx" ON "AdministrativeEntity"("activityArea");
CREATE INDEX "AdministrativeEntity_locality_idx" ON "AdministrativeEntity"("locality");
