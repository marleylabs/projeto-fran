ALTER TABLE "FinancialRecord"
    ALTER COLUMN "companyId" DROP NOT NULL,
    ALTER COLUMN "documentType" DROP NOT NULL,
    ALTER COLUMN "description" DROP NOT NULL,
    ALTER COLUMN "dueDate" DROP NOT NULL,
    ALTER COLUMN "netAmount" DROP NOT NULL;
