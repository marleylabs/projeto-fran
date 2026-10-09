import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { dateOnlyFromDb } from "@/lib/date-only";
import { readCsvMatrix, readXlsxMatrix } from "@/modules/accounts-payable/shared/spreadsheet";
import { buildBasicBasketContext, buildBasicBasketVacationBlocks, calculateCurrentBasketDays, calculateRetroactiveDays, resolveBasicBasketAdjustments, summarizeDateRanges, type BasicBasketAdjustments, type BasicBasketOccurrences } from "./calculations";
import { BasicBasketPointMirrorError, buildBasicBasketPointMirror, hasOccurrences, normalizeBasicBasketPointMirrorMatrix, occurrencesOf, splitAbsenceDates } from "./point-mirror";
import { buildPointMirrorCandidates } from "./point-mirror-review";

// Espelho de Ponto da Cesta Básica: o arquivo (CPF, PIS, CNPJ, jornada) é lido SÓ em memória e descartado; nada
// dele vai para log. Match EXCLUSIVAMENTE por CPF normalizado (nome nunca é fallback). Ficam gravados apenas os
// ajustes processados (datas de Falta Injustificada/Férias por colaborador SELECIONADO) num registro de importação
// cujo id o formulário envia ao salvar — o servidor recalcula tudo a partir dele.
export type BasicBasketPointMirrorStatus = "ABSENCE" | "VACATION" | "NEXT_COMPETENCE" | "BEFORE_ADMISSION" | "NO_OCCURRENCE" | "OUT_OF_PERIOD" | "NOT_SELECTED" | "NOT_ELIGIBLE" | "NOT_FOUND" | "INVALID_CPF" | "NOT_IN_FILE" | "MISSING_ADMISSION";

function decodeCsv(buffer: Buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder("windows-1252").decode(buffer); }
}
async function readMatrix(buffer: Buffer, fileName: string) {
  const name = fileName.toLowerCase();
  try {
    if (name.endsWith(".csv")) return readCsvMatrix(decodeCsv(buffer));
    if (name.endsWith(".xlsx")) return await readXlsxMatrix(buffer); // só valores; fórmula → resultado salvo
  } catch {
    throw new BasicBasketPointMirrorError("Não foi possível ler o arquivo. Envie o Espelho de Ponto em XLSX ou CSV (separado por ;).");
  }
  throw new BasicBasketPointMirrorError("Formato não suportado. Envie o Espelho de Ponto em .xlsx ou .csv.");
}

const STALE_IMPORT_MS = 7 * 24 * 60 * 60 * 1000;

export async function previewBasicBasketPointMirror(input: { buffer: Buffer; fileName: string; year: number; month: number; selectedIds: string[]; userId: string }) {
  if (!Number.isInteger(input.year) || !Number.isInteger(input.month) || input.month < 1 || input.month > 12) throw new BasicBasketPointMirrorError("Competência inválida.");
  const context = buildBasicBasketContext(input.year, input.month);
  const rows = normalizeBasicBasketPointMirrorMatrix(await readMatrix(input.buffer, input.fileName));
  if (!rows.length) throw new BasicBasketPointMirrorError("O Espelho de Ponto não possui linhas de colaboradores.");
  const parsed = buildBasicBasketPointMirror(rows, context);
  const cpfs = [...new Set(parsed.people.map((person) => person.cpf).filter((cpf): cpf is string => Boolean(cpf)))];
  const employees = cpfs.length ? await prisma.foodEmployee.findMany({ where: { cpf: { in: cpfs } }, select: { id: true, officialName: true, department: true, active: true, mergedIntoId: true, cpf: true, admissionDate: true } }) : [];
  const byCpf = new Map(employees.map((employee) => [employee.cpf!, employee]));
  const selected = new Set(input.selectedIds);

  const stored: Record<string, BasicBasketOccurrences> = {};
  const admissionById = new Map<string, string | null>();
  const people = parsed.people.map((person) => {
    const employee = person.cpf ? byCpf.get(person.cpf) : undefined;
    const admissionDate = employee ? dateOnlyFromDb(employee.admissionDate) : null;
    const occurrences = occurrencesOf(person); const absences = splitAbsenceDates(occurrences.absenceDates, context, admissionDate);
    // Férias por bloco contínuo (só a partir da admissão) com os dias financeiros de cada bloco, para a prévia.
    const blockView = (month: "current" | "reference", dates: string[], start: string, end: string) => buildBasicBasketVacationBlocks(dates, start, end, admissionDate ?? start).map((block) => ({ month, label: block.start === block.end ? summarizeDateRanges([block.start]) : `${summarizeDateRanges([block.start])} a ${summarizeDateRanges([block.end])}`, financialDays: block.financialDays.length, extended: block.extendedToMonthEnd, isolatedLastDay: block.isolatedLastDay }));
    const vacationBlocks = [...blockView("current", occurrences.currentVacationDates, context.currentMonthStart, context.currentMonthEnd), ...blockView("reference", occurrences.referenceVacationDates, context.referenceMonthStart, context.referenceMonthEnd)];
    const vacationBeforeAdmission = admissionDate ? [...occurrences.currentVacationDates, ...occurrences.referenceVacationDates].filter((date) => date < admissionDate) : [];
    const eligible = Boolean(employee?.active && !employee.mergedIntoId);
    let adjustments: BasicBasketAdjustments | null = null;
    let status: BasicBasketPointMirrorStatus = !person.cpf ? "INVALID_CPF" : !employee ? "NOT_FOUND" : !eligible ? "NOT_ELIGIBLE" : !selected.has(employee.id) ? "NOT_SELECTED" : !admissionDate ? "MISSING_ADMISSION" : "NO_OCCURRENCE";
    if (status === "NO_OCCURRENCE" && employee) {
      stored[employee.id] = occurrences; // só selecionados aptos: é isto que o salvamento poderá aplicar
      admissionById.set(employee.id, admissionDate);
      adjustments = resolveBasicBasketAdjustments({ context, admissionDate, occurrences });
      // Falta no mês de apuração → corta esta Cesta; Falta só no mês da competência → afeta a próxima competência.
      status = adjustments.currentUnjustifiedAbsence || adjustments.retroactiveUnjustifiedAbsence ? "ABSENCE" : adjustments.currentVacationDays || adjustments.retroactiveVacationDays ? "VACATION" : absences.nextCompetence.length ? "NEXT_COMPETENCE" : absences.beforeAdmission.length || vacationBeforeAdmission.length ? "BEFORE_ADMISSION" : hasOccurrences(occurrences) || person.outOfPeriodRows ? "OUT_OF_PERIOD" : "NO_OCCURRENCE";
    }
    // Resposta sem CPF completo (só mascarado); nome do arquivo apenas para quem não foi localizado.
    return {
      employeeId: employee?.id ?? null, employeeName: employee?.officialName ?? person.name, department: employee?.department ?? null, cpfMasked: person.cpfMasked, status: status as BasicBasketPointMirrorStatus,
      apurationAbsence: summarizeDateRanges(absences.apuration), nextCompetenceAbsence: summarizeDateRanges(absences.nextCompetence), beforeAdmissionAbsence: summarizeDateRanges(absences.beforeAdmission), beforeAdmissionVacation: summarizeDateRanges(vacationBeforeAdmission), vacationBlocks, outOfPeriodRows: person.outOfPeriodRows,
      currentVacation: summarizeDateRanges(occurrences.currentVacationDates), referenceVacation: summarizeDateRanges(occurrences.referenceVacationDates),
      currentVacationDates: occurrences.currentVacationDates.length, referenceVacationDates: occurrences.referenceVacationDates.length,
      absenceEventWithoutJourney: person.absenceEventWithoutJourney, duplicateVacationRows: person.duplicateVacationRows,
      currentBasketDays: admissionDate ? calculateCurrentBasketDays({ context, admissionDate }).currentBasketDays : 0,
      retroactiveDays: admissionDate ? calculateRetroactiveDays({ context, admissionDate }).retroactiveDays : 0,
      adjustments,
    };
  });
  // Selecionados que não aparecem no arquivo: nenhum ajuste (gravados como "coberto, sem ocorrência").
  const inFile = new Set(people.map((person) => person.employeeId).filter(Boolean));
  const missingIds = input.selectedIds.filter((id) => !inFile.has(id));
  const missing = missingIds.length ? await prisma.foodEmployee.findMany({ where: { id: { in: missingIds } }, select: { id: true, officialName: true, department: true } }) : [];
  for (const employee of missing) people.push({ employeeId: employee.id, employeeName: employee.officialName, department: employee.department, cpfMasked: "", status: "NOT_IN_FILE", apurationAbsence: "", nextCompetenceAbsence: "", beforeAdmissionAbsence: "", beforeAdmissionVacation: "", vacationBlocks: [], outOfPeriodRows: 0, currentVacation: "", referenceVacation: "", currentVacationDates: 0, referenceVacationDates: 0, absenceEventWithoutJourney: 0, duplicateVacationRows: 0, currentBasketDays: 0, retroactiveDays: 0, adjustments: null });

  // Limpa importações antigas nunca usadas (não financeiras) e grava a nova.
  await prisma.basicBasketPointMirrorImport.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - STALE_IMPORT_MS) }, allocations: { none: {} } } });
  const record = await prisma.basicBasketPointMirrorImport.create({ data: { year: input.year, month: input.month, sourceRows: parsed.totals.rows, occurrences: stored as Prisma.InputJsonValue, createdByUserId: input.userId } });

  const count = (status: BasicBasketPointMirrorStatus) => people.filter((person) => person.status === status).length;
  // Fase 7E.3: candidatos de REVISÃO (uma linha por data/tipo dos colaboradores aptos), com id desta importação. Nada é
  // aplicado no processamento: o usuário aprova/rejeita; o "Aplicar" e o salvamento revalidam no servidor.
  const candidates = Object.entries(stored).flatMap(([employeeId, occurrences]) => buildPointMirrorCandidates({ importId: record.id, context, employeeId, admissionDate: admissionById.get(employeeId) ?? null, occurrences }));
  return {
    importId: record.id,
    candidates,
    occurrences: stored,
    reference: { current: `${String(context.competenceMonth).padStart(2, "0")}/${context.competenceYear}`, previous: `${String(context.referenceMonth).padStart(2, "0")}/${context.referenceYear}`, absence: `${String(context.absenceReferenceMonth).padStart(2, "0")}/${context.absenceReferenceYear}`, absenceStart: context.absenceReferenceMonthStart, absenceEnd: context.absenceReferenceMonthEnd },
    totals: {
      ...parsed.totals,
      isolatedLastDayVacation: people.filter((person) => person.vacationBlocks.some((block) => block.isolatedLastDay)).length,
      located: people.filter((person) => person.employeeId && person.status !== "NOT_IN_FILE").length,
      absence: count("ABSENCE"), vacation: count("VACATION"), nextCompetence: count("NEXT_COMPETENCE"), beforeAdmission: count("BEFORE_ADMISSION"), noOccurrence: count("NO_OCCURRENCE"), outOfPeriod: count("OUT_OF_PERIOD"),
      notFound: count("NOT_FOUND"), invalidCpfPeople: count("INVALID_CPF"), notSelected: count("NOT_SELECTED"), notEligible: count("NOT_ELIGIBLE"), notInFile: count("NOT_IN_FILE"), missingAdmission: count("MISSING_ADMISSION"),
    },
    people,
  };
}
