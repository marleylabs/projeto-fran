// Tipos compartilhados entre parser (server) e UI (client) para o Extrato Mensal.
// Produzidos por src/lib/parser/parsePayrollPdf.ts, persistidos como JSON em Upload.data (src/lib/db/uploads.ts)
// e consumidos pelas telas de folha (src/modules/accounting/payroll/ui) e pelos exports (src/lib/export).
// Valores monetários são number em reais; campos *Original guardam o texto lido do PDF.

/** Natureza da rubrica. O parser atual só gera Provento e Desconto. */
export type RubricaTipo = "Provento" | "Desconto" | "Informativa" | "Informativa Dedutora";

/** Uma linha da tabela de rubricas do colaborador. `confianca` é "baixa" quando faltou o código ou o marcador P/D. */
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

/** Situação do colaborador no mês; aceita textos livres vindos do PDF além dos conhecidos. */
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

/** Colaborador extraído do Extrato Mensal. Contém dados pessoais (nome, CPF, salário): não registrar em logs. */
export interface Colaborador {
  id: string;
  /** Empresa de origem quando a tela está exibindo uma competência consolidada. */
  empresaNome?: string;
  empresaCnpj?: string;
  competencia?: string;
  arquivoOrigem?: string;
  codigo: string;
  nome: string;
  /** CPF como impresso no PDF; validado só pela máscara (sem dígito verificador). */
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
  /** Texto das linhas do bloco no PDF, para auditoria. */
  textoBruto: string;
  /** Campos que o parser não conseguiu localizar com confiança e precisam de revisão manual. */
  camposBaixaConfianca: string[];
  /** true quando o registro foi corrigido manualmente pelo usuário na interface. */
  revisadoManualmente?: boolean;
}

/** Cabeçalho da empresa no PDF; campos ficam "" quando não encontrados. */
export interface Empresa {
  cnpj: string;
  nome: string;
  competencia: string;
  emissao: string;
  hora: string;
}

/** Totais calculados a partir dos colaboradores (computeTotaisGerais), mais os impressos no PDF para conferência. */
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

/** Resultado do Extrato Mensal: de um PDF (parser) ou consolidado por competência (combineExtratoMensalSources). */
export interface ExtractionResult {
  formato: "extrato-mensal";
  /** Id do registro salvo no banco (ausente se a extração não foi persistida). */
  id?: string;
  /** true quando a resposta reúne mais de um PDF da mesma competência. */
  consolidado?: boolean;
  /** Empresas/arquivos que compõem uma visão consolidada por competência. */
  empresas?: {
    nome: string;
    cnpj: string;
    competencia: string;
    uploadId?: string;
    fileName?: string;
    totalColaboradores: number;
    liquidoGeral: number;
  }[];
  empresa: Empresa;
  colaboradores: Colaborador[];
  totaisGerais: TotaisGerais;
  /** "ocr" hoje só marca PDF sem texto extraível (OCR ainda não implementado). */
  metodoLeitura: "texto" | "ocr";
  avisos: string[];
}

/** PDF sem texto ou com layout não reconhecido; `avisos` explica o motivo. */
export interface FormatoDesconhecidoResult {
  formato: "desconhecido";
  id?: string;
  avisos: string[];
}
