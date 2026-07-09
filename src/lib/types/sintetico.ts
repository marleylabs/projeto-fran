// Tipos do formato "Relatório Sintético de Folha de Pagamento" — um relatório em
// tabela (uma linha por colaborador), diferente do "Extrato Mensal" (em blocos).
// Os nomes de campo seguem a tabela de referência do usuário (Tabela2): MAT, NOME,
// CH, SALARIO, H.E, DSR, TOTAL H.E, SAL FAMILIA, ADC NOTURNO, PERICULOSIDADE, TOTAL,
// INSS, VT, DESC AUT, IR, OUTROS, TOTAL DESC, LIQUIDO.

export interface LinhaSintetico {
  id: string;
  mat: string;
  nome: string;
  ch: string;
  salario: number;
  salarioOriginal: string;
  he: number;
  dsr: number;
  /** Calculado como he + dsr (não vem do PDF, é somado por nós). */
  totalHE: number;
  salFamilia: number;
  adcNoturno: number;
  periculosidade: number;
  /** Extra, não faz parte da Tabela2 de referência, mas preservado para auditoria. */
  insalubridade: number;
  /** Extra, não faz parte da Tabela2 de referência (outros proventos), preservado para auditoria. */
  outrosProventos: number;
  total: number;
  inss: number;
  vt: number;
  descAut: number;
  ir: number;
  outros: number;
  totalDesc: number;
  liquido: number;
  textoBruto: string;
  camposBaixaConfianca: string[];
}

export interface SinteticoEmpresa {
  codigo: string;
  nome: string;
  departamento: string;
  periodoInicio: string;
  periodoFim: string;
  tipoProcesso: string;
  emissao: string;
  hora: string;
}

export interface SinteticoTotais {
  totalColaboradores: number;
  totalSalario: number;
  totalHE: number;
  totalProventos: number;
  totalINSS: number;
  totalVT: number;
  totalIR: number;
  totalDescontos: number;
  liquidoGeral: number;
}

export interface SinteticoResult {
  formato: "relatorio-sintetico";
  /** Id do registro salvo no banco (ausente se a extração não foi persistida). */
  id?: string;
  empresa: SinteticoEmpresa;
  linhas: LinhaSintetico[];
  totais: SinteticoTotais;
  avisos: string[];
  /** Este parser não pôde ser validado contra um PDF real; ver aviso no topo do resultado. */
  experimental: true;
}
