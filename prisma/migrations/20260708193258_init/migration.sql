-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalColaboradores" INTEGER NOT NULL DEFAULT 0,
    "liquidoGeral" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);
