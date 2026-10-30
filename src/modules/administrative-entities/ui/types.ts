// Tipos de EXIBIÇÃO do cadastro geral de entidades administrativas. Sem regra.
// Item como devolvido por GET /api/administrative-entities (CNPJ só dígitos ou null).
export type AdministrativeEntityItem = { id: string; cnpj: string | null; legalName: string; tradeName: string; activityArea: string; appliesProjeta: boolean; appliesBoinga: boolean; locality: string };
// Estado do formulário: tudo texto; SIM/NÃO como "true"/"false" e "" = ainda não escolhido.
export type AdministrativeEntityForm = { cnpj: string; legalName: string; tradeName: string; activityArea: string; appliesProjeta: "" | "true" | "false"; appliesBoinga: "" | "true" | "false"; locality: string };
