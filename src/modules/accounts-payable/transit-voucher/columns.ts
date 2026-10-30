// Layout oficial da planilha de importação de Vale Transporte (fluxo legado de upload: processing.ts lê,
// templates.ts gera a máscara). A tela atual lança VT manualmente; estes nomes seguem usados pelas rotas
// de upload/template e pelos testes. Renomear uma coluna quebra planilhas já distribuídas aos usuários.

/** Nome da aba lida no XLSX (readXlsxMatrix) e criada na máscara. */
export const TRANSIT_VOUCHER_SHEET_NAME = "VALE TRANSPORTE";
/** Nome da tabela do Excel criada na máscara oficial. */
export const TRANSIT_VOUCHER_TABLE_NAME = "ValeTransporteOficial";

/** Colunas da máscara, na ordem em que aparecem (a leitura localiza por nome/alias, não por posição). */
export const TRANSIT_VOUCHER_COLUMNS = [
  "EMPRESA",
  "NOME",
  "DATA",
  "DEPARTAMENTO",
  "SERVIÇO",
  "CC",
  "VALOR DIA",
  "DIF MÊS ANTERIOR",
  "DESCONTOS EVENTUAIS",
  "DIAS",
  "VALOR TOTAL",
] as const;

/** Colunas sem as quais o arquivo inteiro é rejeitado (blockingError em processing.ts). */
export const TRANSIT_VOUCHER_REQUIRED_COLUMNS = [
  "EMPRESA",
  "NOME",
  "DATA",
  "DEPARTAMENTO",
  "VALOR TOTAL",
] as const;
