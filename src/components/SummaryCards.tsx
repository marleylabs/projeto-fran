import type { TotaisGerais } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";
import { MetricCard } from "@/components/ui";

export function SummaryCards({ totais }: { totais: TotaisGerais }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <MetricCard label="Colaboradores" value={String(totais.totalColaboradores)} accent />
      <MetricCard label="Total Proventos" value={`R$ ${formatBRNumber(totais.totalProventos)}`} />
      <MetricCard label="Total Descontos" value={`R$ ${formatBRNumber(totais.totalDescontos)}`} />
      <MetricCard label="Líquido Geral" value={`R$ ${formatBRNumber(totais.liquidoGeral)}`} accent />
      <MetricCard label="Total FGTS" value={`R$ ${formatBRNumber(totais.totalFGTS)}`} />
      <MetricCard label="Total INSS" value={`R$ ${formatBRNumber(totais.totalINSS)}`} />
      <MetricCard label="Total IRRF" value={`R$ ${formatBRNumber(totais.totalIRRF)}`} />
      <MetricCard label="Total H.E" value={`R$ ${formatBRNumber(totais.totalHE)}`} />
    </div>
  );
}
