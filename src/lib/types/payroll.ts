// Tipos compartilhados entre parser (server) e UI (client) para o Extrato Mensal.

export type RubricaTipo = "Provento" | "Desconto" | "Informativa" | "Informativa Dedutora";

export interface Rubrica {
  codigo: string;
  descricao: string;
  tipo: RubricaTipo;
  referencia?: string;
  valor: number;
  valorOriginal: string;
  percentual?: string;
  quantidade?: string;
  confianca: "alta" | "baixa";
}

export type Situacao =
  | "Trabalhando"
  | "Férias"
  | "Afastado"
  | (string & {});

/** Um campo extraído com valor tratado + texto original, para permitir auditoria/edição manual. */
export interface CampoNumerico {
  valor: number;
  original: string;
}

export interface Colaborador {
  id: string;
  codigo: string;
  nome: string;
  cpf: string;
  admissao: string;
  situacao: Situacao;
  vinculo: string;
  horasMes: string;
  departamento: string;
  centroCusto: string;
  cargoCodigo: string;
  cargo: string;
  cbo: string;
  filial: string;
  salario: number;
  salarioOriginal: string;
  proventos: number;
  descontos: number;
  liquido: number;
  informativa: number;
  informativaDedutora: number;
  baseINSS: number;
  baseFGTS: number;
  baseIRRF: number;
  excedenteINSS: number;
  valorFGTS: number;
  rubricas: Rubrica[];
  observacoes: string[];
  textoBruto: string;
  /** Campos que o parser não conseguiu localizar com confiança e precisam de revisão manual. */
  camposBaixaConfianca: string[];
  /** true quando o registro foi corrigido manualmente pelo usuário na interface. */
  revisadoManualmente?: boolean;
}

export interface Empresa {
  cnpj: string;
  nome: string;
  competencia: string;
  emissao: string;
  hora: string;
}

export interface TotaisGerais {
  totalColaboradores: number;
  totalProventos: number;
  totalDescontos: number;
  liquidoGeral: number;
  totalFGTS: number;
  totalINSS: number;
  totalIRRF: number;
  /** Soma das rubricas de horas extras (códigos 150, 160, 200). */
  totalHE: number;
  /** Totais impressos no rodapé do PDF, quando encontrados, para conferência com os calculados. */
  totalProventosImpresso?: number;
  totalDescontosImpressoPDF?: number;
  liquidoGeralImpressoPDF?: number;
}

export interface ExtractionResult {
  formato: "extrato-mensal";
  /** Id do registro salvo no banco (ausente se a extração não foi persistida). */
  id?: string;
  empresa: Empresa;
  colaboradores: Colaborador[];
  totaisGerais: TotaisGerais;
  metodoLeitura: "texto" | "ocr";
  avisos: string[];
}

export interface FormatoDesconhecidoResult {
  formato: "desconhecido";
  id?: string;
  avisos: string[];
}
