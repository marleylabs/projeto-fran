import type { LinhaSintetico } from "@/lib/types/sintetico";

// Layout de colunas do Relatório Sintético, reaproveitado também pela exportação XLSX do Extrato Mensal
// (./excel + ./unifiedRow). A ordem precisa bater com `linhaSinteticoToRow` e `unifiedRowToArray`.

/** Cabeçalhos das colunas (MAT..LIQUIDO). */
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

/** Converte uma linha do Relatório Sintético num array alinhado a SINTETICO_HEADERS. */
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
