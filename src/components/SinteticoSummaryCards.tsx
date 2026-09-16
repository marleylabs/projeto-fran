import type { SinteticoTotais } from "@/lib/types/sintetico";
import { formatBRNumber } from "@/lib/normalize/money";
import { MetricCard } from "@/components/ui";

export function SinteticoSummaryCards({ totais }: { totais: SinteticoTotais }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <MetricCard label="Colaboradores" value={String(totais.totalColaboradores)} accent />
      <MetricCard label="Total Salário" value={`R$ ${formatBRNumber(totais.totalSalario)}`} />
      <MetricCard label="Total H.E" value={`R$ ${formatBRNumber(totais.totalHE)}`} />
      <MetricCard label="Total Proventos" value={`R$ ${formatBRNumber(totais.totalProventos)}`} />
      <MetricCard label="Líquido Geral" value={`R$ ${formatBRNumber(totais.liquidoGeral)}`} accent />
      <MetricCard label="Total INSS" value={`R$ ${formatBRNumber(totais.totalINSS)}`} />
      <MetricCard label="Total VT" value={`R$ ${formatBRNumber(totais.totalVT)}`} />
      <MetricCard label="Total IR" value={`R$ ${formatBRNumber(totais.totalIR)}`} />
    </div>
  );
}
