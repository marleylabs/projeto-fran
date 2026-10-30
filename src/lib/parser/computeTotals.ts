// Totais gerais do Extrato Mensal. Usado pelo parser (parsePayrollPdf.ts) e pela consolidação (combineExtratoMensal.ts).

import type { Colaborador, TotaisGerais } from "@/lib/types/payroll";

// Soma arredondada a centavos, evitando resíduo de ponto flutuante.
function sum(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

// Soma rubricas cuja descrição casa com o padrão (usado para INSS e IRRF).
function sumRubricaByDescricao(colaboradores: Colaborador[], pattern: RegExp): number {
  let total = 0;
  for (const c of colaboradores) {
    for (const r of c.rubricas) {
      if (pattern.test(r.descricao)) total += r.valor;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Rubricas de horas extras (50%, 60%, 100%) neste layout de folha. */
const CODIGOS_HORAS_EXTRAS = ["150", "160", "200"];

// Soma rubricas pelos códigos informados.
function sumRubricaByCodigo(colaboradores: Colaborador[], codigos: string[]): number {
  let total = 0;
  for (const c of colaboradores) {
    for (const r of c.rubricas) {
      if (codigos.includes(r.codigo)) total += r.valor;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Recalcula os totais gerais a partir da lista de colaboradores (usado após extração e após revisão manual). */
export function computeTotaisGerais(colaboradores: Colaborador[]): TotaisGerais {
  return {
    totalColaboradores: colaboradores.length,
    totalProventos: sum(colaboradores.map((c) => c.proventos)),
    totalDescontos: sum(colaboradores.map((c) => c.descontos)),
    liquidoGeral: sum(colaboradores.map((c) => c.liquido)),
    totalFGTS: sum(colaboradores.map((c) => c.valorFGTS)),
    totalINSS: sumRubricaByDescricao(colaboradores, /I\.?N\.?S\.?S\.?/i),
    totalIRRF: sumRubricaByDescricao(colaboradores, /IMPOSTO DE RENDA/i),
    totalHE: sumRubricaByCodigo(colaboradores, CODIGOS_HORAS_EXTRAS),
  };
}
