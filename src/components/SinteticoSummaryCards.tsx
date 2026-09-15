import { Users, Wallet, Clock, TrendingUp, Landmark, Receipt, BadgeDollarSign } from "lucide-react";
import type { SinteticoTotais } from "@/lib/types/sintetico";
import { formatBRNumber } from "@/lib/normalize/money";
import { MetricCard } from "./ui/MetricCard";

export function SinteticoSummaryCards({ totais }: { totais: SinteticoTotais }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard label="Colaboradores" value={String(totais.totalColaboradores)} icon={Users} accent />
      <MetricCard label="Total Salário" value={`R$ ${formatBRNumber(totais.totalSalario)}`} icon={BadgeDollarSign} />
      <MetricCard label="Total H.E" value={`R$ ${formatBRNumber(totais.totalHE)}`} icon={Clock} />
      <MetricCard label="Total Proventos" value={`R$ ${formatBRNumber(totais.totalProventos)}`} icon={TrendingUp} />
      <MetricCard label="Líquido Geral" value={`R$ ${formatBRNumber(totais.liquidoGeral)}`} icon={Wallet} accent />
      <MetricCard label="Total INSS" value={`R$ ${formatBRNumber(totais.totalINSS)}`} icon={Landmark} />
      <MetricCard label="Total VT" value={`R$ ${formatBRNumber(totais.totalVT)}`} icon={Receipt} />
      <MetricCard label="Total IR" value={`R$ ${formatBRNumber(totais.totalIR)}`} icon={Receipt} />
    </div>
  );
}
