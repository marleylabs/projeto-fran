import type { LinhaSintetico } from "@/lib/types/sintetico";

export const SINTETICO_HEADERS = [
  "MAT",
  "NOME",
  "CH",
  "SALARIO",
  "H.E",
  "DSR",
  "TOTAL H.E",
  "SAL FAMILIA",
  "ADC NOTURNO",
  "PERICULOSIDADE",
  "TOTAL",
  "INSS",
  "VT",
  "DESC AUT",
  "IR",
  "OUTROS",
  "TOTAL DESC",
  "LIQUIDO",
] as const;

export function linhaSinteticoToRow(l: LinhaSintetico): (string | number)[] {
  return [
    l.mat,
    l.nome,
    l.ch,
    l.salario,
    l.he,
    l.dsr,
    l.totalHE,
    l.salFamilia,
    l.adcNoturno,
    l.periculosidade,
    l.total,
    l.inss,
    l.vt,
    l.descAut,
    l.ir,
    l.outros,
    l.totalDesc,
    l.liquido,
  ];
}
