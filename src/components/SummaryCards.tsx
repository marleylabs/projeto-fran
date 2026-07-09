import type { TotaisGerais } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs font-medium text-text-muted uppercase tracking-wide truncate">{label}</span>
      <span className={accent ? "text-2xl font-bold text-primary truncate" : "text-2xl font-bold text-foreground truncate"}>
        {value}
      </span>
    </div>
  );
}

export function SummaryCards({ totais }: { totais: TotaisGerais }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <Card label="Colaboradores" value={String(totais.totalColaboradores)} accent />
      <Card label="Total Proventos" value={`R$ ${formatBRNumber(totais.totalProventos)}`} />
      <Card label="Total Descontos" value={`R$ ${formatBRNumber(totais.totalDescontos)}`} />
      <Card label="Líquido Geral" value={`R$ ${formatBRNumber(totais.liquidoGeral)}`} accent />
      <Card label="Total FGTS" value={`R$ ${formatBRNumber(totais.totalFGTS)}`} />
      <Card label="Total INSS" value={`R$ ${formatBRNumber(totais.totalINSS)}`} />
      <Card label="Total IRRF" value={`R$ ${formatBRNumber(totais.totalIRRF)}`} />
      <Card label="Total H.E" value={`R$ ${formatBRNumber(totais.totalHE)}`} />
    </div>
  );
}
