// Despesas → Plano de Saúde. Página só de moldura (Server Component): toda a lógica (upload do PDF da operadora,
// valor por titular, rateio) fica em HealthPlanSection, no módulo health-plan.
import { HealthPlanSection } from "@/modules/accounts-payable/health-plan/HealthPlanSection";

export default function HealthPlanPage() {
  return <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6"><HealthPlanSection /></main>;
}
