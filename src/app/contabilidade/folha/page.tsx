// Rota /contabilidade/folha: Folha (Extrato Mensal / Relatório Sintético). A página só monta o workspace do módulo
// accounting/payroll, que concentra upload, conferência e exportações.
import { PayrollWorkspace } from "@/modules/accounting/payroll";

/** Rota canônica do módulo atual durante a transição para o Financeiro Global. */
export default function AccountingPayrollPage() {
  return <PayrollWorkspace />;
}
