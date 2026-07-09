import type { LinhaSintetico, SinteticoTotais } from "@/lib/types/sintetico";

function sum(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

export function computeSinteticoTotais(linhas: LinhaSintetico[]): SinteticoTotais {
  return {
    totalColaboradores: linhas.length,
    totalSalario: sum(linhas.map((l) => l.salario)),
    totalHE: sum(linhas.map((l) => l.totalHE)),
    totalProventos: sum(linhas.map((l) => l.total)),
    totalINSS: sum(linhas.map((l) => l.inss)),
    totalVT: sum(linhas.map((l) => l.vt)),
    totalIR: sum(linhas.map((l) => l.ir)),
    totalDescontos: sum(linhas.map((l) => l.totalDesc)),
    liquidoGeral: sum(linhas.map((l) => l.liquido)),
  };
}
