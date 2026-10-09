// Revisão/aprovação das ocorrências do Espelho de Ponto e Férias manuais da Cesta Básica (Fase 7E.3). Funções PURAS,
// usadas pela tela (prévia ao vivo) e pelo servidor (autoridade no "Aplicar" e no salvamento). Não muda a fórmula:
//   • cada DATA importada (Falta Injustificada, Férias da competência, Férias do mês anterior) vira um candidato com id
//     determinístico `${importId}:${employeeId}:${tipo}:${data}` (sem CPF; nunca a posição na tabela);
//   • candidato ACIONÁVEL = poderia afetar o valor (mesmas condições de resolveBasicBasketAdjustments); os demais ficam
//     IGNORADOS com o motivo já usado na tela (anterior à admissão, afeta a próxima competência, sem direito...);
//   • só datas APROVADAS entram em resolveBasicBasketAdjustments (blocos, fevereiro, dia 31 — algoritmo intacto);
//   • Férias manuais (dias financeiros 0..30 da Cesta da COMPETÊNCIA) SUBSTITUEM as Férias importadas da competência
//     (nunca somam); Falta e Retroativo continuam pelo Espelho aprovado. Enquanto houver manual, as Férias importadas da
//     competência não exigem decisão (sem efeito financeiro).
import { calculateCurrentBasketDays, calculateRetroactiveDays, resolveBasicBasketAdjustments, BASIC_BASKET_CALCULATION_DAYS, NO_BASIC_BASKET_ADJUSTMENTS, type BasicBasketAdjustments, type BasicBasketContext, type BasicBasketOccurrences } from "./calculations";

export class BasicBasketReviewError extends Error {}

export type PointMirrorCandidateKind = "ABSENCE" | "VACATION_CURRENT" | "VACATION_REFERENCE";
export type PointMirrorCandidateEffect = "CURRENT_CUT" | "RETRO_CUT" | "CURRENT_VACATION" | "RETRO_VACATION";
export type PointMirrorCandidate = { id: string; employeeId: string; kind: PointMirrorCandidateKind; date: string; effects: PointMirrorCandidateEffect[]; ignoredReason: string | null };
export type PointMirrorDecision = "APPROVED" | "REJECTED";
export type PointMirrorReviewState = "PENDING" | "APPROVED" | "REJECTED" | "IGNORED" | "MANUAL_OVERRIDE";

export const pointMirrorCandidateId = (importId: string, employeeId: string, kind: PointMirrorCandidateKind, date: string) => `${importId}:${employeeId}:${kind}:${date}`;
const within = (date: string, start: string, end: string) => date >= start && date <= end;

/** Candidatos de revisão de UM colaborador a partir das datas gravadas na importação. */
export function buildPointMirrorCandidates(input: { importId: string; context: BasicBasketContext; employeeId: string; admissionDate: string | null | undefined; occurrences: BasicBasketOccurrences }): PointMirrorCandidate[] {
  const { importId, context, employeeId, admissionDate, occurrences } = input;
  const current = admissionDate ? calculateCurrentBasketDays({ context, admissionDate }).currentBasketDays : 0;
  const retro = admissionDate ? calculateRetroactiveDays({ context, admissionDate }).retroactiveDays : 0;
  const make = (kind: PointMirrorCandidateKind, date: string, effects: PointMirrorCandidateEffect[], fallback: string): PointMirrorCandidate =>
    ({ id: pointMirrorCandidateId(importId, employeeId, kind, date), employeeId, kind, date, effects, ignoredReason: effects.length ? null : fallback });
  const beforeAdmission = (date: string) => !admissionDate || date < admissionDate;
  const list: PointMirrorCandidate[] = [];
  for (const date of [...new Set(occurrences.absenceDates)].sort()) {
    if (beforeAdmission(date)) { list.push(make("ABSENCE", date, [], admissionDate ? "Ocorrência anterior à admissão — ignorada" : "Sem Data de Admissão — não aplicado")); continue; }
    const effects: PointMirrorCandidateEffect[] = [];
    if (current > 0 && within(date, context.absenceReferenceMonthStart, context.absenceReferenceMonthEnd)) effects.push("CURRENT_CUT");
    if (retro > 0 && within(date, context.referenceMonthStart, context.referenceMonthEnd)) effects.push("RETRO_CUT");
    list.push(make("ABSENCE", date, effects, within(date, context.currentMonthStart, context.currentMonthEnd) ? "Afeta a próxima competência" : "Sem efeito nesta competência"));
  }
  for (const date of [...new Set(occurrences.currentVacationDates)].sort())
    list.push(make("VACATION_CURRENT", date, beforeAdmission(date) || current <= 0 ? [] : ["CURRENT_VACATION"], beforeAdmission(date) ? "Anterior à admissão — não reduz" : "Sem dias de direito na competência"));
  for (const date of [...new Set(occurrences.referenceVacationDates)].sort())
    list.push(make("VACATION_REFERENCE", date, beforeAdmission(date) || retro <= 0 ? [] : ["RETRO_VACATION"], beforeAdmission(date) ? "Anterior à admissão — não reduz" : "Sem Retroativo no mês anterior"));
  return list;
}

/** Exige decisão? Ignorados nunca; Férias da competência não, enquanto houver Férias manuais (sem efeito financeiro). */
export const isPointMirrorCandidateActionable = (candidate: PointMirrorCandidate, manualVacationDays: number | null | undefined) =>
  !candidate.ignoredReason && !(candidate.kind === "VACATION_CURRENT" && manualVacationDays !== null && manualVacationDays !== undefined);

export function pointMirrorReviewState(candidate: PointMirrorCandidate, decision: PointMirrorDecision | undefined, manualVacationDays: number | null | undefined): PointMirrorReviewState {
  if (candidate.ignoredReason) return "IGNORED";
  if (!isPointMirrorCandidateActionable(candidate, manualVacationDays)) return "MANUAL_OVERRIDE";
  return decision ?? "PENDING";
}

export function summarizePointMirrorReview(candidates: readonly PointMirrorCandidate[], decisions: Readonly<Record<string, PointMirrorDecision>>, manualByEmployee: Readonly<Record<string, number | null | undefined>>) {
  const totals = { total: candidates.length, PENDING: 0, APPROVED: 0, REJECTED: 0, IGNORED: 0, MANUAL_OVERRIDE: 0 };
  for (const candidate of candidates) totals[pointMirrorReviewState(candidate, decisions[candidate.id], manualByEmployee[candidate.employeeId])] += 1;
  return totals;
}

/** Validação AUTORITATIVA das decisões enviadas: ids precisam existir NESTA importação, sem conflito, e nenhuma
 *  ocorrência acionável dos colaboradores do lançamento pode ficar pendente. Retorna o conjunto aprovado. */
export function validatePointMirrorDecisions(input: { candidates: readonly PointMirrorCandidate[]; approvedIds: unknown; rejectedIds: unknown; employeeIds: readonly string[]; manualByEmployee: Readonly<Record<string, number | null | undefined>> }) {
  const list = (value: unknown) => { if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) throw new BasicBasketReviewError("Revisão do Espelho de Ponto inválida."); return value as string[]; };
  const approved = new Set(list(input.approvedIds)), rejected = new Set(list(input.rejectedIds));
  const known = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  for (const id of [...approved, ...rejected]) if (!known.has(id)) throw new BasicBasketReviewError("Revisão inválida: há ocorrência que não pertence a esta importação do Espelho de Ponto. Processe o arquivo novamente.");
  for (const id of approved) if (rejected.has(id)) throw new BasicBasketReviewError("Revisão inválida: ocorrência aprovada e rejeitada ao mesmo tempo.");
  const scope = new Set(input.employeeIds);
  const pending = input.candidates.filter((candidate) => scope.has(candidate.employeeId) && isPointMirrorCandidateActionable(candidate, input.manualByEmployee[candidate.employeeId]) && !approved.has(candidate.id) && !rejected.has(candidate.id));
  if (pending.length) throw new BasicBasketReviewError(`Revise as ocorrências do Espelho de Ponto antes de aplicar: ${pending.length} ${pending.length === 1 ? "pendente" : "pendentes"}.`);
  return approved;
}

/** Só as datas APROVADAS (as rejeitadas e as ignoradas não entram no cálculo). */
export function approvedPointMirrorOccurrences(occurrences: BasicBasketOccurrences, candidates: readonly PointMirrorCandidate[], approved: ReadonlySet<string>): BasicBasketOccurrences {
  const keep = (kind: PointMirrorCandidateKind) => new Set(candidates.filter((candidate) => candidate.kind === kind && approved.has(candidate.id)).map((candidate) => candidate.date));
  const absence = keep("ABSENCE"), current = keep("VACATION_CURRENT"), reference = keep("VACATION_REFERENCE");
  return { absenceDates: occurrences.absenceDates.filter((date) => absence.has(date)), currentVacationDates: occurrences.currentVacationDates.filter((date) => current.has(date)), referenceVacationDates: occurrences.referenceVacationDates.filter((date) => reference.has(date)) };
}

/** Férias manuais: vazio → null (usa o Espelho); inteiro 0..30; não pode passar dos dias de direito (sem clamp). */
export function parseManualVacationDays(value: unknown, entitlementDays?: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isInteger(number) || number < 0 || number > BASIC_BASKET_CALCULATION_DAYS) throw new BasicBasketReviewError(`Férias manuais: informe um número inteiro de 0 a ${BASIC_BASKET_CALCULATION_DAYS} dias.`);
  if (entitlementDays !== undefined && number > entitlementDays) throw new BasicBasketReviewError(`O colaborador possui apenas ${entitlementDays} ${entitlementDays === 1 ? "dia financeiro elegível" : "dias financeiros elegíveis"} nesta competência.`);
  return number;
}

/** Férias manuais SUBSTITUEM as Férias da competência (Falta e Retroativo intactos). */
export const applyManualVacation = (adjustments: BasicBasketAdjustments, manualVacationDays: number | null | undefined): BasicBasketAdjustments =>
  manualVacationDays === null || manualVacationDays === undefined ? adjustments : { ...adjustments, currentVacationDays: manualVacationDays };

/** Ajustes finais de um colaborador: Espelho (só aprovados) → override manual. Mesma função na tela e no servidor. */
export function resolveReviewedBasicBasketAdjustments(input: { context: BasicBasketContext; admissionDate: string | null | undefined; occurrences: BasicBasketOccurrences | null | undefined; candidates: readonly PointMirrorCandidate[]; approved: ReadonlySet<string>; manualVacationDays: number | null | undefined }) {
  const imported = input.occurrences ? resolveBasicBasketAdjustments({ context: input.context, admissionDate: input.admissionDate, occurrences: approvedPointMirrorOccurrences(input.occurrences, input.candidates, input.approved) }) : NO_BASIC_BASKET_ADJUSTMENTS;
  return { imported, importedVacationDays: input.occurrences ? imported.currentVacationDays : null, adjustments: applyManualVacation(imported, input.manualVacationDays) };
}

// ---- Correção histórica das Férias manuais (Fase 7E.4). Só o override manual é corrigível; o resto vem do snapshot do
// lançamento corrigido (nunca de um Espelho/cadastro atual): Falta, Retroativo e as Férias importadas aprovadas.
type VacationSnapshot = BasicBasketAdjustments & { manualVacationDays: number | null; importedVacationDays: number | null };

/** Férias do Espelho no lançamento original: o snapshot `importedVacationDays`; em lançamentos anteriores à 7E.3 (sem
 *  esse campo e sem manual) as Férias efetivas vieram do próprio Espelho, então valem `currentVacationDays`. */
export const historicalImportedVacationDays = (original: VacationSnapshot) =>
  original.importedVacationDays ?? (original.manualVacationDays === null ? original.currentVacationDays : 0);

/** Ajustes do replacement: snapshot do original com as Férias da competência = manual corrigido (null → importado). */
export function correctionAdjustments(original: VacationSnapshot, manualVacationDays: number | null): BasicBasketAdjustments {
  return { currentVacationDays: manualVacationDays ?? historicalImportedVacationDays(original), currentUnjustifiedAbsence: original.currentUnjustifiedAbsence, retroactiveVacationDays: original.retroactiveVacationDays, retroactiveUnjustifiedAbsence: original.retroactiveUnjustifiedAbsence };
}

/** Férias manuais da correção: campo OMITIDO (undefined) preserva o manual do original; null limpa (volta ao importado
 *  do snapshot); 0 e N são overrides explícitos. `parsed` já validado por parseManualVacationDays. */
export const correctionManualVacationDays = (field: unknown, parsed: number | null, original: number | null) => (field === undefined ? original : parsed);
