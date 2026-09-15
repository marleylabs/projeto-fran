import { Users, TrendingUp, TrendingDown, Wallet, PiggyBank, Landmark, Receipt, Clock } from "lucide-react";
import type { TotaisGerais } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";
import { MetricCard } from "./ui/MetricCard";

export function SummaryCards({ totais }: { totais: TotaisGerais }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard label="Colaboradores" value={String(totais.totalColaboradores)} icon={Users} accent />
      <MetricCard label="Total Proventos" value={`R$ ${formatBRNumber(totais.totalProventos)}`} icon={TrendingUp} />
      <MetricCard label="Total Descontos" value={`R$ ${formatBRNumber(totais.totalDescontos)}`} icon={TrendingDown} />
      <MetricCard label="Líquido Geral" value={`R$ ${formatBRNumber(totais.liquidoGeral)}`} icon={Wallet} accent />
      <MetricCard label="Total FGTS" value={`R$ ${formatBRNumber(totais.totalFGTS)}`} icon={PiggyBank} />
      <MetricCard label="Total INSS" value={`R$ ${formatBRNumber(totais.totalINSS)}`} icon={Landmark} />
      <MetricCard label="Total IRRF" value={`R$ ${formatBRNumber(totais.totalIRRF)}`} icon={Receipt} />
      <MetricCard label="Total H.E" value={`R$ ${formatBRNumber(totais.totalHE)}`} icon={Clock} />
    </div>
  );
}
