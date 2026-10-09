// Tipos de EXIBIÇÃO do cadastro de colaboradores (formato devolvido pelas APIs e estado da tela). Sem regra.
export type CollaboratorItem = {
  id: string; officialName: string; normalizedName: string; jobTitle: string; department: string; costCenter: string;
  cpf?: string | null; admissionDate?: string | null; active: boolean; mergedIntoId?: string | null;
};
export type CollaboratorForm = { officialName: string; jobTitle: string; department: string; costCenter: string; cpf: string; admissionDate: string; active: boolean };

export type ImportStatus = "CREATE" | "UPDATE" | "UNCHANGED" | "REVIEW" | "SKIP" | "ERROR";
export type ImportOverride = "SKIP" | "CREATE" | "UPDATE";
export type ImportRow = {
  sourceRow: number;
  file: { id?: string; officialName: string; jobTitle?: string; department?: string; costCenter?: string; cpf?: string; admissionDate?: string };
  status: ImportStatus; matchedBy: string | null;
  match: { id: string; officialName: string; department: string; costCenter: string; cpf: string | null } | null;
  changes: string[]; errors: string[];
};
export type ImportPreview = { total: number; counts: Record<ImportStatus, number>; rows: ImportRow[]; blocked: boolean };
export type ImportResult = { total: number; created: number; updated: number; unchanged: number; skipped: number; errors: number };

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = { CREATE: "Criar", UPDATE: "Atualizar", UNCHANGED: "Sem alteração", REVIEW: "Revisão", SKIP: "Ignorar", ERROR: "Erro" };
export const MATCHED_BY_LABELS: Record<string, string> = { ID: "via ID", CPF: "via CPF", NOME: "via nome exato", ALIAS: "nome mesclado/alias", SIMILAR: "nome parecido", REVISAO: "escolhido na revisão" };
