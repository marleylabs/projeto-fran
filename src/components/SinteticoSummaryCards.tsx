import type { SinteticoTotais } from "@/lib/types/sintetico";
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

export function SinteticoSummaryCards({ totais }: { totais: SinteticoTotais }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <Card label="Colaboradores" value={String(totais.totalColaboradores)} accent />
      <Card label="Total Salário" value={`R$ ${formatBRNumber(totais.totalSalario)}`} />
      <Card label="Total H.E" value={`R$ ${formatBRNumber(totais.totalHE)}`} />
      <Card label="Total Proventos" value={`R$ ${formatBRNumber(totais.totalProventos)}`} />
      <Card label="Líquido Geral" value={`R$ ${formatBRNumber(totais.liquidoGeral)}`} accent />
      <Card label="Total INSS" value={`R$ ${formatBRNumber(totais.totalINSS)}`} />
      <Card label="Total VT" value={`R$ ${formatBRNumber(totais.totalVT)}`} />
      <Card label="Total IR" value={`R$ ${formatBRNumber(totais.totalIR)}`} />
    </div>
  );
}
