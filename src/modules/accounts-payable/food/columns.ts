// Cabeçalhos esperados nas planilhas de Alimentação. MA (Maranhão) usa DATA/NOME/SETOR; PA (Pará) usa o
// layout do fornecedor abaixo. Também reutilizado pelo Vale Transporte (processing/templates).

/** Colunas da planilha MA. */
export const FOOD_MA_COLUMNS = ["DATA", "NOME", "SETOR"] as const;

/** Colunas da planilha PA, na ordem do modelo gerado. */
export const FOOD_PA_COLUMNS = [
  "DATA",
  "ANO",
  "MÊS",
  "NOME",
  "DPTO",
  "EMISSÃO NF",
  "RESTAURANTE",
  "VALOR",
] as const;

/** Colunas PA obrigatórias: ANO e MÊS são opcionais (a competência vem da tela). */
export const FOOD_PA_REQUIRED_COLUMNS = FOOD_PA_COLUMNS.filter(
  (column) => column !== "ANO" && column !== "MÊS",
);
