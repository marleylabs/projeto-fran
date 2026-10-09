// Tipos de EXIBIÇÃO do cadastro geral de entidades administrativas. Sem regra.
export type AdministrativeEntityItem = { id: string; cnpj: string | null; legalName: string; tradeName: string; activityArea: string; appliesProjeta: boolean; appliesBoinga: boolean; locality: string };
export type AdministrativeEntityForm = { cnpj: string; legalName: string; tradeName: string; activityArea: string; appliesProjeta: "" | "true" | "false"; appliesBoinga: "" | "true" | "false"; locality: string };
