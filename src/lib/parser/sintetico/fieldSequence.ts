// A tabela do "Relatório Sintético" tem colunas fixas nesta ordem esquerda->direita
// (confirmado cruzando a aba "Report", bruta, com a aba "Tabela2", já limpa, da
// planilha de referência do usuário). Como não temos um PDF real para calibrar por
// palavra-chave com segurança (acentos podem vir corrompidos), o mapeamento é
// posicional: a Nª âncora de coluna encontrada no cabeçalho vira o Nº campo desta lista.
export const SINTETICO_FIELD_SEQUENCE = [
  "mat",
  "nome",
  "ch",
  "salario",
  "he",
  "dsr",
  "salFamilia",
  "insalubridade",
  "periculosidade",
  "adcNoturno",
  "outrosProventos",
  "total",
  "inss",
  "vt",
  "descAut",
  "ir",
  "outros",
  "totalDesc",
  "liquido",
  "assinatura",
] as const;

export type SinteticoFieldKey = (typeof SINTETICO_FIELD_SEQUENCE)[number];

export const SINTETICO_NUMERIC_FIELDS: SinteticoFieldKey[] = [
  "salario",
  "he",
  "dsr",
  "salFamilia",
  "insalubridade",
  "periculosidade",
  "adcNoturno",
  "outrosProventos",
  "total",
  "inss",
  "vt",
  "descAut",
  "ir",
  "outros",
  "totalDesc",
  "liquido",
];

/** Palavras-chave usadas apenas para RECONHECER a linha de cabeçalho da tabela (não para mapear campos). */
export const HEADER_KEYWORDS = [
  "CÓDIGO",
  "CODIGO",
  "NOME",
  "HORAS",
  "SALÁRIO",
  "SALARIO",
  "EXTRA",
  "REPOUSO",
  "FAMILIA",
  "FAMÍLIA",
  "INSALUBR",
  "PERICUL",
  "NOTURN",
  "TOTAL",
  "INSS",
  "VALE",
  "TRANSP",
  "DESCONT",
  "AUTORIZ",
  "IRRF",
  "LÍQUIDO",
  "LIQUIDO",
  "RECEBER",
];
