import { PayrollWorkspace } from "@/modules/accounting/payroll";

/**
 * Adaptador de compatibilidade. A raiz continuará apontando para o módulo de
 * folha até a Home Operacional do Financeiro Global ser implementada.
 */
export default function HomePage() {
  return <PayrollWorkspace />;
}
