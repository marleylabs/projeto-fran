export const FOOD_MA_COLUMNS = ["DATA", "NOME", "SETOR"] as const;

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

export const FOOD_PA_REQUIRED_COLUMNS = FOOD_PA_COLUMNS.filter(
  (column) => column !== "ANO" && column !== "MÊS",
);
