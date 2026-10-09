-- Empresa padrão do colaborador para o Vale Transporte (preferência atual; NÃO é snapshot histórico).
ALTER TABLE "TransitVoucherEmployeeConfig" ADD COLUMN "defaultCompanyId" TEXT;
CREATE INDEX "TransitVoucherEmployeeConfig_defaultCompanyId_idx" ON "TransitVoucherEmployeeConfig"("defaultCompanyId");
ALTER TABLE "TransitVoucherEmployeeConfig" ADD CONSTRAINT "TransitVoucherEmployeeConfig_defaultCompanyId_fkey" FOREIGN KEY ("defaultCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
