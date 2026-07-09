import type { Colaborador } from "@/lib/types/payroll";

// Mapeamento de rubrica (por código) usado para montar a planilha única de
// exportação do Extrato Mensal, no mesmo formato de colunas do Relatório
// Sintético (Tabela2 de referência do usuário).
const CODIGOS_HE = ["150", "160", "200"]; // Horas Extras 50%/60%/100%
const CODIGO_DSR = "250"; // Reflexo Extras DSR
const CODIGO_SAL_FAMILIA = "995";
const CODIGO_ADC_NOTURNO = "8924";
const CODIGO_PERICULOSIDADE = "149";
const CODIGO_INSS = "998";
const CODIGO_VT = "48";
const CODIGO_DESC_AUT = "223";
const CODIGO_IR = "999";

function sumByCodigo(colaborador: Colaborador, codigos: string[]): number {
  let total = 0;
  for (const r of colaborador.rubricas) {
    if (codigos.includes(r.codigo)) total += r.valor;
  }
  return Math.round(total * 100) / 100;
}

export interface UnifiedRow {
  mat: string;
  nome: string;
  ch: string;
  salario: number;
  he: number;
  dsr: number;
  totalHE: number;
  salFamilia: number;
  adcNoturno: number;
  periculosidade: number;
  total: number;
  inss: number;
  vt: number;
  descAut: number;
  ir: number;
  outros: number;
  totalDesc: number;
  liquido: number;
}

/**
 * Converte um colaborador do Extrato Mensal para a mesma "forma" de linha do
 * Relatório Sintético (Tabela2), somando as rubricas pelos códigos indicados
 * pelo usuário. H.E e DSR são exibidas só para conferência visual — o TOTAL usa
 * apenas TOTAL H.E (que já é H.E + DSR) para não contar essas parcelas em dobro.
 */
export function unifiedRowFromColaborador(c: Colaborador): UnifiedRow {
  const he = sumByCodigo(c, CODIGOS_HE);
  const dsr = sumByCodigo(c, [CODIGO_DSR]);
  const totalHE = Math.round((he + dsr) * 100) / 100;
  const salFamilia = sumByCodigo(c, [CODIGO_SAL_FAMILIA]);
  const adcNoturno = sumByCodigo(c, [CODIGO_ADC_NOTURNO]);
  const periculosidade = sumByCodigo(c, [CODIGO_PERICULOSIDADE]);
  const total = Math.round((c.salario + totalHE + salFamilia + adcNoturno + periculosidade) * 100) / 100;

  const inss = sumByCodigo(c, [CODIGO_INSS]);
  const vt = sumByCodigo(c, [CODIGO_VT]);
  const descAut = sumByCodigo(c, [CODIGO_DESC_AUT]);
  const ir = sumByCodigo(c, [CODIGO_IR]);
  const outros = 0;
  const totalDesc = Math.round((inss + descAut + ir + outros) * 100) / 100;

  const liquido = Math.round((total - totalDesc) * 100) / 100;

  return {
    mat: c.codigo,
    nome: c.nome,
    ch: c.horasMes,
    salario: c.salario,
    he,
    dsr,
    totalHE,
    salFamilia,
    adcNoturno,
    periculosidade,
    total,
    inss,
    vt,
    descAut,
    ir,
    outros,
    totalDesc,
    liquido,
  };
}

/** MAT como número (quando só tem dígitos) para permitir a formatação "000025" no Excel. */
function matAsNumberOrText(mat: string): string | number {
  return /^\d+$/.test(mat) ? Number(mat) : mat;
}

export function unifiedRowToArray(r: UnifiedRow): (string | number)[] {
  return [
    matAsNumberOrText(r.mat),
    r.nome,
    r.ch,
    r.salario,
    r.he,
    r.dsr,
    r.totalHE,
    r.salFamilia,
    r.adcNoturno,
    r.periculosidade,
    r.total,
    r.inss,
    r.vt,
    r.descAut,
    r.ir,
    r.outros,
    r.totalDesc,
    r.liquido,
  ];
}
