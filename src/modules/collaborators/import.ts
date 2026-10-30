// Importação de colaboradores por planilha XLSX (máscara oficial) e geração da própria máscara. Funções puras
// sobre dados já carregados (sem Prisma): o server.ts lê a base e grava; a rota /api/collaborators/import
// chama a prévia/confirmação. Também usado por scripts/audit-collaborator-duplicates.ts (classifyCollaborator).
// Dados pessoais: CPF só aparece mascarado (maskCpf) nas respostas sobre cadastros existentes.
import ExcelJS from "exceljs";
import { findHeader, normalizeCell, readXlsxMatrix } from "@/modules/accounts-payable/shared/spreadsheet";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from "@/lib/cpf";
import { dateOnlyFromDb, dateOnlyToDb, formatDateOnlyBR, parseSpreadsheetDate } from "@/lib/date-only";

/** Erro de linha quando a célula de admissão é fórmula sem valor salvo (o exceljs não recalcula fórmulas). */
export const ADMISSION_FORMULA_WITHOUT_RESULT_MESSAGE = "A Data de Admissão contém uma fórmula sem resultado calculado. Abra o arquivo no Excel, atualize os vínculos e salve novamente ou converta a fórmula em valor.";
import { normalizeCollaboratorSearch, normalizeCollaboratorText } from "./schema";

/** Campos comparáveis de um colaborador (planilha ou banco). normalizedName = chave sem acentos/minúsculas. */
export type CollaboratorRow = { officialName: string; normalizedName: string; jobTitle: string; department: string; costCenter: string };
export type ExistingCollaborator = CollaboratorRow & { id: string; active: boolean };
/** Classificação simples usada na detecção de duplicados (não no plano de importação com CPF/ID). */
export type ImportClassification = "NEW" | "EXISTING" | "UPDATE_AVAILABLE" | "POSSIBLE_DUPLICATE";

// Palavras do nome normalizado com mais de 1 letra (descarta iniciais e partículas de uma letra).
function tokens(value: string) { return new Set(normalizeCollaboratorSearch(value).split(" ").filter(token => token.length > 1)); }
/**
 * Score 0..1 de semelhança: 80% vem da fração de palavras do nome em comum (sobre o nome mais curto) e +10%
 * para cada campo igual entre departamento, centro de custo e função. Limitado a 1.
 */
export function collaboratorSimilarity(a: Pick<CollaboratorRow,"officialName"|"department"|"jobTitle"|"costCenter">, b: Pick<CollaboratorRow,"officialName"|"department"|"jobTitle"|"costCenter">) {
  const left=tokens(a.officialName),right=tokens(b.officialName); const intersection=[...left].filter(token=>right.has(token)).length; const nameScore=intersection/Math.max(Math.min(left.size,right.size),1);
  const fieldScore=[a.department&&b.department&&normalizeCollaboratorSearch(a.department)===normalizeCollaboratorSearch(b.department),a.costCenter&&b.costCenter&&normalizeCollaboratorSearch(a.costCenter)===normalizeCollaboratorSearch(b.costCenter),a.jobTitle&&b.jobTitle&&normalizeCollaboratorSearch(a.jobTitle)===normalizeCollaboratorSearch(b.jobTitle)].filter(Boolean).length;
  return Math.min(1,nameScore*0.8+fieldScore*0.1);
}
/**
 * Nome normalizado igual → EXISTING (ou UPDATE_AVAILABLE se algum campo difere). Senão, o mais parecido com
 * score ≥ 0,72 → POSSIBLE_DUPLICATE; abaixo disso → NEW. O limiar 0,72 é o mesmo do plano de importação.
 */
export function classifyCollaborator(row: CollaboratorRow, existing: ExistingCollaborator[]) {
  const exact=existing.find(item=>item.normalizedName===row.normalizedName);
  if(exact){const fields: Array<keyof Pick<CollaboratorRow,"officialName"|"jobTitle"|"department"|"costCenter">>=["officialName","jobTitle","department","costCenter"];const changed=fields.some(field=>normalizeCollaboratorSearch(row[field])!==normalizeCollaboratorSearch(exact[field]));return{classification:(changed?"UPDATE_AVAILABLE":"EXISTING") as ImportClassification,match:exact,score:1};}
  const ranked=existing.map(item=>({item,score:collaboratorSimilarity(row,item)})).sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>=0.72?{classification:"POSSIBLE_DUPLICATE" as const,match:ranked[0].item,score:ranked[0].score}:{classification:"NEW" as const,match:null,score:0};
}

// ---------------------------------------------------------------------------------------------
// Importação com CREATE/UPDATE (máscara com CPF e ID).
//
// Localização do colaborador existente, nesta ordem (determinística):
//   1. ID     — coluna ID da máscara (pré-preenchida no download): identifica exatamente o cadastro.
//   2. CPF    — quando o CPF da planilha já está cadastrado.
//   3. NOME   — nome normalizado EXATO (único no banco).
// Nome parecido (similaridade ≥ 0,72) ou alias de cadastro mesclado NÃO atualiza sozinho: fica em
// REVISÃO (padrão: ignorar) até o usuário decidir. Célula vazia = "não alterar este campo" — nunca
// apaga dado existente (inclusive CPF). CPF diferente do cadastrado só é corrigido via ID.
// Qualquer ERRO bloqueia a importação inteira: nada é gravado parcialmente.
// ---------------------------------------------------------------------------------------------
/** Linha lida da planilha. sourceRow = número da linha no Excel (cabeçalho é a 1). errors = erros de leitura. */
export type CollaboratorSheetRow = { sourceRow: number; id?: string; officialName: string; jobTitle?: string; department?: string; costCenter?: string; cpf?: string; admissionDate?: string; errors: string[] };
/** Colaborador existente como o plano precisa (inclui CPF completo; nunca vai para a resposta sem máscara). */
export type ImportCandidate = CollaboratorRow & { id: string; cpf: string | null; admissionDate?: Date | null; active: boolean; mergedIntoId: string | null };
/** Nome alternativo (FoodEmployeeAlias) que aponta para um cadastro, criado em mesclas. */
export type ImportAlias = { normalizedAlias: string; employeeId: string };
/** Decisão do usuário para uma linha em REVISÃO, indexada por sourceRow. */
export type ImportOverride = "SKIP" | "CREATE" | "UPDATE";
/** Resultado do plano por linha. REVIEW = aguardando decisão; SKIP = usuário decidiu ignorar. */
export type ImportRowStatus = "CREATE" | "UPDATE" | "UNCHANGED" | "REVIEW" | "SKIP" | "ERROR";
/** Como o cadastro existente foi encontrado; REVISAO = atualização confirmada pelo usuário em uma linha de revisão. */
export type ImportMatchedBy = "ID" | "CPF" | "NOME" | "ALIAS" | "SIMILAR" | "REVISAO";
/**
 * Linha planejada. `create`/`update` são os dados de escrita (só no servidor; a prévia os remove antes de
 * responder). `file` é o que veio da planilha, formatado para exibição.
 */
export type PlannedImportRow = {
  sourceRow: number;
  file: { id?: string; officialName: string; jobTitle?: string; department?: string; costCenter?: string; cpf?: string; admissionDate?: string };
  status: ImportRowStatus; matchedBy: ImportMatchedBy | null;
  match: { id: string; officialName: string; department: string; costCenter: string; cpf: string | null } | null;
  changes: string[]; errors: string[];
  create?: CollaboratorRow & { cpf: string | null; admissionDate: Date | null; active: boolean };
  update?: { id: string; data: Partial<CollaboratorRow & { cpf: string; admissionDate: Date }> };
};

// Rótulos das colunas usados na lista de "campos alterados" mostrada na prévia.
const FIELD_LABELS = { officialName: "Nome", jobTitle: "Função", department: "Departamento", costCenter: "Centro de Custo", cpf: "CPF", admissionDate: "Data de Admissão" } as const;
const optional = (value: string | undefined) => (value ? value : undefined);

/**
 * Lê a primeira aba do XLSX. Colunas obrigatórias: NOME e DEPARTAMENTO; opcionais: FUNÇÃO, CENTRO DE CUSTO,
 * CPF, DATA DE ADMISSÃO e ID. Linhas totalmente vazias são ignoradas. Erros por linha (nome ausente, CPF
 * inválido, data inválida) vão em `errors`; lança Error só se a planilha estiver vazia ou sem as colunas obrigatórias.
 */
export async function parseCollaboratorWorkbook(buffer: Buffer): Promise<CollaboratorSheetRow[]> {
  const matrix = await readXlsxMatrix(buffer); if (!matrix.length) throw new Error("A planilha está vazia.");
  const headers = matrix[0].map(normalizeCell);
  const name = findHeader(headers, ["NOME"]), job = findHeader(headers, ["FUNÇÃO", "FUNCAO"]), department = findHeader(headers, ["DEPARTAMENTO"]), cost = findHeader(headers, ["CENTRO DE CUSTO"]), cpf = findHeader(headers, ["CPF"]), id = findHeader(headers, ["ID"]), admission = findHeader(headers, ["DATA DE ADMISSÃO"]);
  if (name < 0 || department < 0) throw new Error("A máscara deve conter NOME e DEPARTAMENTO.");
  return matrix.slice(1).map((values, index) => ({ sourceRow: index + 2, values })).filter((item) => item.values.some((value) => normalizeCell(value))).map(({ sourceRow, values }) => {
    const errors: string[] = [];
    const officialName = normalizeCollaboratorText(values[name]);
    if (!officialName) errors.push("Nome não informado.");
    const rawCpf = cpf >= 0 ? values[cpf] : undefined;
    const hasCpf = rawCpf !== undefined && rawCpf !== null && normalizeCell(rawCpf) !== "";
    const cpfDigits = hasCpf ? normalizeCpf(rawCpf) : undefined;
    if (hasCpf && !isValidCpf(cpfDigits)) errors.push("CPF inválido.");
    // Data de Admissão: dd/MM/yyyy, Date real da célula XLSX, serial do Excel ou fórmula com resultado
    // salvo no arquivo (ex.: PROCX/XLOOKUP de outra planilha). Vazia = não alterar.
    const admissionCell = admission >= 0 ? parseSpreadsheetDate(values[admission]) : { status: "empty" as const };
    const admissionDate = admissionCell.status === "date" ? admissionCell.iso : undefined;
    if (admissionCell.status === "invalid") errors.push("Data de Admissão inválida.");
    if (admissionCell.status === "formula-without-result") errors.push(ADMISSION_FORMULA_WITHOUT_RESULT_MESSAGE);
    return {
      sourceRow, officialName, errors,
      id: id >= 0 ? optional(normalizeCell(values[id])) : undefined,
      jobTitle: job >= 0 ? optional(normalizeCollaboratorText(values[job])) : undefined,
      department: optional(normalizeOrganizationalValue(normalizeCell(values[department]))),
      costCenter: cost >= 0 ? optional(normalizeOrganizationalValue(normalizeCell(values[cost]))) : undefined,
      cpf: cpfDigits,
      admissionDate,
    };
  });
}

/**
 * Monta o plano de importação (sem gravar): para cada linha decide CREATE, UPDATE, UNCHANGED, REVIEW, SKIP ou
 * ERROR, seguindo a ordem de localização descrita no bloco acima. Depois valida o arquivo inteiro (CPF,
 * colaborador ou nome final repetidos entre linhas). `blocked` = existe ao menos uma linha em ERRO.
 */
export function planCollaboratorImport(rows: CollaboratorSheetRow[], existing: ImportCandidate[], aliases: ImportAlias[] = [], overrides: Record<number, ImportOverride> = {}) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const byCpf = new Map(existing.filter((item) => item.cpf).map((item) => [item.cpf!, item]));
  const byName = new Map(existing.map((item) => [item.normalizedName, item]));
  const active = existing.filter((item) => !item.mergedIntoId);
  // Cadastro mesclado → devolve o principal (para onde a linha deve ir, se o usuário confirmar).
  const primaryOf = (item: ImportCandidate) => (item.mergedIntoId ? byId.get(item.mergedIntoId) ?? null : item);
  // Resumo do cadastro encontrado para a prévia: CPF sempre mascarado.
  const summary = (item: ImportCandidate | null) => (item ? { id: item.id, officialName: item.officialName, department: item.department, costCenter: item.costCenter, cpf: item.cpf ? maskCpf(item.cpf) : null } : null);

  const planned = rows.map((row): PlannedImportRow & { target: ImportCandidate | null; finalName?: string } => {
    const errors = [...row.errors];
    const file = { id: row.id, officialName: row.officialName, jobTitle: row.jobTitle, department: row.department, costCenter: row.costCenter, cpf: row.cpf ? formatCpf(row.cpf) : undefined, admissionDate: row.admissionDate ? formatDateOnlyBR(row.admissionDate) : undefined };
    const cpf = row.cpf && isValidCpf(row.cpf) ? row.cpf : undefined;
    const normalizedName = normalizeCollaboratorSearch(row.officialName);
    let target: ImportCandidate | null = null, review: ImportCandidate | null = null, matchedBy: ImportMatchedBy | null = null;

    if (row.id) {
      const byIdMatch = byId.get(row.id);
      if (!byIdMatch) errors.push("ID não encontrado no cadastro de colaboradores.");
      else if (byIdMatch.mergedIntoId) errors.push("ID pertence a um cadastro mesclado; use o ID do cadastro principal.");
      else { target = byIdMatch; matchedBy = "ID"; }
    } else if (cpf && byCpf.has(cpf)) {
      const owner = byCpf.get(cpf)!;
      if (owner.mergedIntoId) errors.push(`CPF ${maskCpf(cpf)} pertence a um cadastro mesclado.`);
      else { target = owner; matchedBy = "CPF"; }
    } else if (normalizedName && byName.has(normalizedName)) {
      const exact = byName.get(normalizedName)!;
      if (exact.mergedIntoId) { review = primaryOf(exact); matchedBy = "ALIAS"; } else { target = exact; matchedBy = "NOME"; }
    } else if (normalizedName) {
      const alias = aliases.find((item) => item.normalizedAlias === normalizedName);
      const aliasOwner = alias ? byId.get(alias.employeeId) ?? null : null;
      if (aliasOwner) { review = primaryOf(aliasOwner); matchedBy = "ALIAS"; }
      else {
        const best = active.map((item) => ({ item, score: collaboratorSimilarity({ officialName: row.officialName, jobTitle: row.jobTitle ?? "", department: row.department ?? "", costCenter: row.costCenter ?? "" }, item) })).sort((a, b) => b.score - a.score)[0];
        if (best && best.score >= 0.72) { review = best.item; matchedBy = "SIMILAR"; }
      }
    }

    // Revisão: só vira escrita por decisão explícita do usuário.
    let creating = !target && !review && !errors.length;
    if (review && !target) {
      const decision = overrides[row.sourceRow] ?? "SKIP";
      if (decision === "UPDATE") { target = review; matchedBy = "REVISAO"; }
      else if (decision === "CREATE") creating = true;
      else return { sourceRow: row.sourceRow, file, status: errors.length ? "ERROR" : overrides[row.sourceRow] ? "SKIP" : "REVIEW", matchedBy, match: summary(review), changes: [], errors, target: null };
    }

    // Atualização: grava só campos preenchidos e diferentes. CPF de outro cadastro ou CPF divergente (sem ID)
    // é erro, para não trocar CPF por engano em um match por nome.
    if (target) {
      if (cpf) {
        const owner = byCpf.get(cpf);
        if (owner && owner.id !== target.id) errors.push(`CPF ${maskCpf(cpf)} já pertence a outro colaborador (${owner.officialName}).`);
        else if (target.cpf && target.cpf !== cpf && matchedBy !== "ID") errors.push("CPF da planilha diferente do CPF cadastrado. Para corrigir o CPF, use a máscara com a coluna ID.");
      }
      const data: Partial<CollaboratorRow & { cpf: string; admissionDate: Date }> = {};
      if (normalizedName && normalizedName !== normalizeCollaboratorSearch(target.officialName)) {
        const other = byName.get(normalizedName);
        if (other && other.id !== target.id) errors.push(`Nome já pertence a outro colaborador (${other.officialName}).`);
        data.officialName = row.officialName; data.normalizedName = normalizedName;
      }
      if (row.jobTitle && normalizeCollaboratorSearch(row.jobTitle) !== normalizeCollaboratorSearch(target.jobTitle)) data.jobTitle = row.jobTitle;
      if (row.department && row.department !== target.department) data.department = row.department;
      if (row.costCenter && row.costCenter !== target.costCenter) data.costCenter = row.costCenter;
      if (cpf && cpf !== target.cpf) data.cpf = cpf;
      // Data de Admissão só é ATUALIZADA (nunca usada para localizar o colaborador); vazia não apaga.
      if (row.admissionDate && row.admissionDate !== dateOnlyFromDb(target.admissionDate)) data.admissionDate = dateOnlyToDb(row.admissionDate);
      const changes = (Object.keys(data) as Array<keyof typeof data>).filter((key) => key !== "normalizedName").map((key) => FIELD_LABELS[key as keyof typeof FIELD_LABELS]);
      return { sourceRow: row.sourceRow, file, status: errors.length ? "ERROR" : changes.length ? "UPDATE" : "UNCHANGED", matchedBy, match: summary(target), changes, errors, target, finalName: data.normalizedName ?? target.normalizedName, ...(changes.length ? { update: { id: target.id, data } } : {}) };
    }

    // Criação: exige departamento e confere nome e CPF únicos contra a base.
    if (creating) {
      if (!row.department) errors.push("Departamento é obrigatório para novo colaborador.");
      if (normalizedName && byName.has(normalizedName)) errors.push("Já existe um colaborador com este nome.");
      if (cpf && byCpf.has(cpf)) errors.push(`CPF ${maskCpf(cpf)} já pertence a outro colaborador (${byCpf.get(cpf)!.officialName}).`);
      const create = { officialName: row.officialName, normalizedName, jobTitle: row.jobTitle ?? "", department: row.department ?? "", costCenter: row.costCenter ?? "", cpf: cpf ?? null, admissionDate: row.admissionDate ? dateOnlyToDb(row.admissionDate) : null, active: true };
      return { sourceRow: row.sourceRow, file, status: errors.length ? "ERROR" : "CREATE", matchedBy: null, match: summary(review), changes: [], errors, target: null, finalName: normalizedName, ...(errors.length ? {} : { create }) };
    }
    return { sourceRow: row.sourceRow, file, status: "ERROR", matchedBy, match: null, changes: [], errors, target: null };
  });

  // Validações do arquivo inteiro (antes de qualquer escrita).
  const conflict = (key: (row: (typeof planned)[number]) => string | undefined, message: (lines: string) => string) => {
    const groups = new Map<string, typeof planned>();
    for (const row of planned) { const value = key(row); if (value) groups.set(value, [...(groups.get(value) ?? []), row]); }
    for (const group of groups.values()) if (group.length > 1) { const lines = group.map((row) => row.sourceRow).join(", ").replace(/, (\d+)$/, " e $1"); for (const row of group) row.errors.push(message(lines)); }
  };
  conflict((row) => (row.file.cpf ? normalizeCpf(row.file.cpf) : undefined), (lines) => `Linhas ${lines} possuem o mesmo CPF.`);
  conflict((row) => row.target?.id, (lines) => `Linhas ${lines} correspondem ao mesmo colaborador.`);
  conflict((row) => (row.status === "CREATE" || row.status === "UPDATE" || row.status === "UNCHANGED" ? row.finalName : undefined), (lines) => `Linhas ${lines} resultariam no mesmo nome de colaborador.`);

  // Remove campos internos e garante que linha com erro não carregue dados de escrita.
  const result: PlannedImportRow[] = planned.map(({ target: _target, finalName: _finalName, ...row }) => {
    void _target; void _finalName;
    if (!row.errors.length) return row;
    return { ...row, status: "ERROR" as const, create: undefined, update: undefined };
  });
  const counts = result.reduce((total, row) => ({ ...total, [row.status]: total[row.status] + 1 }), { CREATE: 0, UPDATE: 0, UNCHANGED: 0, REVIEW: 0, SKIP: 0, ERROR: 0 } as Record<ImportRowStatus, number>);
  return { total: result.length, counts, rows: result, blocked: counts.ERROR > 0 };
}

// Máscara oficial: as colunas de sempre + CPF + DATA DE ADMISSÃO + ID, pré-preenchida com a base atual
// para que a reimportação localize cada colaborador pelo ID (sem depender do nome). Linha nova = sem ID.
// DATA DE ADMISSÃO vai como célula de DATA real (dd/mm/yyyy), não texto — edição e reimportação diretas.
/** Gera o XLSX (abas COLABORADORES e INSTRUÇÕES) e devolve o Buffer para download. Colunas CPF e ID como texto. */
export async function generateCollaboratorTemplate(collaborators: Array<{ id: string; officialName: string; jobTitle: string; department: string; costCenter: string; cpf: string | null; admissionDate?: Date | null }> = []) {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("COLABORADORES");
  sheet.addRow(["NOME", "FUNÇÃO", "DEPARTAMENTO", "CENTRO DE CUSTO", "CPF", "DATA DE ADMISSÃO", "ID"]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAF1B1B" } };
  sheet.getCell("G1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B7280" } };
  [38, 30, 28, 24, 18, 20, 30].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getColumn(5).numFmt = "@"; sheet.getColumn(6).numFmt = "dd/mm/yyyy"; sheet.getColumn(7).numFmt = "@";
  for (const item of collaborators) { const admission = dateOnlyFromDb(item.admissionDate); sheet.addRow([item.officialName, item.jobTitle, item.department, item.costCenter, item.cpf ? formatCpf(item.cpf) : "", admission ? dateOnlyToDb(admission) : null, item.id]); }
  for (let row = 2; row <= sheet.rowCount; row += 1) { sheet.getCell(`F${row}`).numFmt = "dd/mm/yyyy"; sheet.getCell(`G${row}`).font = { color: { argb: "FF6B7280" } }; }
  sheet.views = [{ state: "frozen", ySplit: 1 }]; sheet.autoFilter = "A1:G1";
  const help = workbook.addWorksheet("INSTRUÇÕES");
  help.addRows([
    ["Como usar esta máscara"],
    ["• Colaborador existente: mantenha a coluna ID como está e edite os demais campos (ex.: preencha o CPF ou a Data de Admissão)."],
    ["• Colaborador novo: adicione uma linha com a coluna ID vazia (NOME e DEPARTAMENTO obrigatórios)."],
    ["• Célula vazia não apaga o dado atual (Função, Centro de Custo, CPF e Data de Admissão permanecem como estão)."],
    ["• CPF aceita 12345678909 ou 123.456.789-09 e é validado pelos dígitos verificadores."],
    ["• DATA DE ADMISSÃO: data no formato dd/mm/aaaa (ex.: 05/10/2026). Ela não identifica o colaborador."],
    ["• Não altere nem copie IDs entre linhas: cada ID identifica um único colaborador."],
  ]);
  help.getRow(1).font = { bold: true }; help.getColumn(1).width = 110;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
