// Tipos de EXIBIÇÃO do cadastro de colaboradores (formato devolvido pelas APIs e estado da tela). Sem regra.
// Colaborador como devolvido por GET /api/collaborators (CPF só dígitos; admissionDate date-only ISO).
export type CollaboratorItem = {
  id: string; officialName: string; normalizedName: string; jobTitle: string; department: string; costCenter: string;
  cpf?: string | null; admissionDate?: string | null; active: boolean; mergedIntoId?: string | null;
};
// Estado do formulário de criar/editar (CPF com ou sem máscara; admissionDate yyyy-MM-dd ou "").
export type CollaboratorForm = { officialName: string; jobTitle: string; department: string; costCenter: string; cpf: string; admissionDate: string; active: boolean };

// Espelho, para a tela, dos tipos de resultado da importação em ../import.ts (manter em sincronia).
export type ImportStatus = "CREATE" | "UPDATE" | "UNCHANGED" | "REVIEW" | "SKIP" | "ERROR";
export type ImportOverride = "SKIP" | "CREATE" | "UPDATE";
// Linha da prévia (sem dados internos de escrita). match.cpf chega mascarado pelo servidor.
export type ImportRow = {
  sourceRow: number;
  file: { id?: string; officialName: string; jobTitle?: string; department?: string; costCenter?: string; cpf?: string; admissionDate?: string };
  status: ImportStatus; matchedBy: string | null;
  match: { id: string; officialName: string; department: string; costCenter: string; cpf: string | null } | null;
  changes: string[]; errors: string[];
};
// Prévia completa; blocked = há linha com erro e a confirmação não é permitida.
export type ImportPreview = { total: number; counts: Record<ImportStatus, number>; rows: ImportRow[]; blocked: boolean };
// Resumo devolvido após confirmar a importação.
export type ImportResult = { total: number; created: number; updated: number; unchanged: number; skipped: number; errors: number };

// Rótulos em português de status e da forma de localização exibidos na prévia.
export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = { CREATE: "Criar", UPDATE: "Atualizar", UNCHANGED: "Sem alteração", REVIEW: "Revisão", SKIP: "Ignorar", ERROR: "Erro" };
export const MATCHED_BY_LABELS: Record<string, string> = { ID: "via ID", CPF: "via CPF", NOME: "via nome exato", ALIAS: "nome mesclado/alias", SIMILAR: "nome parecido", REVISAO: "escolhido na revisão" };
