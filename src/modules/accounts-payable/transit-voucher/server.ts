import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { createFinancialRecordInTransaction } from "@/modules/accounts-payable/server/financialRecords";
import { localityAllows } from "@/modules/accounts-payable/food/processing";
import { removePrivateFile, sanitizeOriginalName, storePrivateFile } from "@/modules/documents/server/privateStorage";
import { normalizeTransitName, normalizeTransitVoucherCorrection, parseTransitVoucherCsv, parseTransitVoucherXlsx, type TransitVoucherRawRow } from "./processing";
import { matchFoodEmployee } from "@/modules/accounts-payable/food/matching";
import { normalizeFoodName } from "@/modules/accounts-payable/food/ma-processing";
export const MAX_TRANSIT_VOUCHER_FILE_SIZE = 10 * 1024 * 1024; export class TransitVoucherValidationError extends Error {}
function validateCompetence(year: number, month: number) { if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new TransitVoucherValidationError("Competência inválida."); }
export async function getTransitVoucherCompetence(year: number, month: number) { validateCompetence(year, month); return prisma.transitVoucherCompetence.findUnique({ where: { year_month: { year, month } }, include: { maps: { where: { current: true, cancelledAt: null }, include: { administrativeEntity: true, financialRecord: true, allocations: { where: { deletedAt: null }, orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } } } }); }
export async function processTransitVoucherMap(input: { year: number; month: number; administrativeEntityId: string; userId: string; file: File }) {
  validateCompetence(input.year, input.month); if (input.file.size <= 0 || input.file.size > MAX_TRANSIT_VOUCHER_FILE_SIZE) throw new TransitVoucherValidationError("A planilha deve possuir até 10 MB."); const extension = input.file.name.toLowerCase().split(".").pop(); if (extension !== "csv" && extension !== "xlsx") throw new TransitVoucherValidationError("Envie um arquivo CSV ou XLSX.");
  const entity = await prisma.administrativeEntity.findUnique({ where: { id: input.administrativeEntityId } }); if (!entity) throw new TransitVoucherValidationError("Fornecedor não encontrado em Cadastros."); if (!localityAllows(entity.locality, "MA")) throw new TransitVoucherValidationError(`O cadastro ${entity.tradeName} não está habilitado para MA.`);
  const buffer = Buffer.from(await input.file.arrayBuffer()); if (extension === "xlsx" && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new TransitVoucherValidationError("O arquivo XLSX possui assinatura inválida."); const result = extension === "xlsx" ? await parseTransitVoucherXlsx(buffer) : parseTransitVoucherCsv(buffer.toString("utf8"));
  if (result.blockingError) throw new TransitVoucherValidationError(result.blockingError);
  const [employees, aliases] = await Promise.all([
    prisma.foodEmployee.findMany({ where: { active: true } }),
    prisma.foodEmployeeAlias.findMany({ include: { employee: true } }),
  ]);
  const matchedAllocations = result.allocations.map((row) => {
    const match = matchFoodEmployee(row.employeeName, row.department, employees, aliases);
    return { ...row, employeeId: match.employee?.id ?? null, employeeName: match.employee?.officialName ?? row.employeeName };
  });
  const preparedAllocations = matchedAllocations.filter((row) => row.employeeId);
  const unmatchedIssues = matchedAllocations.filter((row) => !row.employeeId).map((row) => ({ sourceRow: row.sourceRow, employeeName: row.originalEmployeeName, code: "UNMATCHED_EMPLOYEE", message: "Colaborador não encontrado no Cadastro Mestre.", rawData: row as unknown as Record<string, unknown>, fieldErrors: [{ field: "employeeName", label: "NOME", reason: "unmatched", message: "Selecione um colaborador oficial." }], suggestedData: null }));
  const pendingNames = result.issues.map((issue) => String(issue.rawData?.employeeName ?? "")).filter(Boolean);
  const history = pendingNames.length ? await prisma.transitVoucherAllocation.findMany({ where: { employeeName: { in: pendingNames } }, orderBy: { createdAt: "desc" } }) : [];
  const preparedIssues = [...result.issues.map((issue) => {
    const receivedName = String(issue.rawData?.employeeName ?? ""); const normalizedName = normalizeTransitName(receivedName);
    const official = employees.filter((employee) => employee.normalizedName === normalizedName);
    const previous = history.filter((row) => normalizeTransitName(row.employeeName) === normalizedName);
    const combinations = new Map(previous.map((row) => [`${row.company}\u0000${row.department ?? ""}\u0000${row.service ?? ""}\u0000${row.costCenter ?? ""}`, row]));
    const historical = combinations.size === 1 ? [...combinations.values()][0] : null;
    const suggestedData = historical ? { employeeId: historical.employeeId, employeeName: historical.employeeName, company: historical.company, department: historical.department, service: historical.service, costCenter: historical.costCenter, source: "Histórico anterior" } : official.length === 1 ? { employeeId: official[0].id, employeeName: official[0].officialName, department: official[0].department, source: "Cadastro oficial" } : null;
    return { ...issue, suggestedData };
  }), ...unmatchedIssues];
  const totalAmount = preparedAllocations.reduce((sum, row) => sum.add(new Prisma.Decimal(row.amount)), new Prisma.Decimal(0));
  const companyTotal = [...preparedAllocations.reduce((groups, row) => groups.set(row.company, (groups.get(row.company) ?? new Prisma.Decimal(0)).add(row.amount)), new Map<string, Prisma.Decimal>()).values()].reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
  const departmentTotal = [...preparedAllocations.reduce((groups, row) => { const key = `${row.company}\u0000${row.department}`; return groups.set(key, (groups.get(key) ?? new Prisma.Decimal(0)).add(row.amount)); }, new Map<string, Prisma.Decimal>()).values()].reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
  if (!companyTotal.equals(totalAmount) || !departmentTotal.equals(totalAmount)) throw new TransitVoucherValidationError("Erro de integridade no rateio: colaborador, departamento, empresa e total geral divergem.");
  if (!preparedAllocations.length && !preparedIssues.length) throw new TransitVoucherValidationError("Nenhuma linha foi encontrada no arquivo.");
  const stored = await storePrivateFile(buffer);
  const duplicate = await prisma.transitVoucherMap.findFirst({ where: { competence: { year: input.year, month: input.month }, administrativeEntityId: input.administrativeEntityId, current: true, sha256: stored.sha256 }, include: { administrativeEntity: true, financialRecord: true, allocations: { orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } });
  if (duplicate && duplicate.issues.every((issue) => issue.rawData)) { await removePrivateFile(stored.storageKey); return duplicate; }
  try { return await prisma.$transaction(async (tx) => { const competence = await tx.transitVoucherCompetence.upsert({ where: { year_month: { year: input.year, month: input.month } }, create: { year: input.year, month: input.month }, update: {} }); const scope = { competenceId: competence.id, administrativeEntityId: input.administrativeEntityId }; const previous = await tx.transitVoucherMap.findFirst({ where: { ...scope, current: true }, orderBy: { version: "desc" } }); if (previous) { await tx.transitVoucherMap.update({ where: { id: previous.id }, data: { current: false } }); if (previous.financialRecordId) await tx.financialRecord.update({ where: { id: previous.financialRecordId }, data: { lifecycleState: "CANCELLED", paymentState: "CANCELLED" } }); } const last = await tx.transitVoucherMap.findFirst({ where: scope, select: { version: true }, orderBy: { version: "desc" } }); const status = preparedIssues.length ? "WITH_INCONSISTENCIES" as const : "READY" as const;
    const map = await tx.transitVoucherMap.create({ data: { ...scope, uploadedByUserId: input.userId, locality: "MA", version: (last?.version ?? 0) + 1, status, originalName: sanitizeOriginalName(input.file.name), storageKey: stored.storageKey, mimeType: extension === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: input.file.size, sha256: stored.sha256, totalRows: result.totalRows, validRows: preparedAllocations.length, invalidRows: preparedIssues.length, totalAmount, allocations: { create: preparedAllocations.map((row) => ({ competenceId: competence.id, administrativeEntityId: input.administrativeEntityId, sourceRow: row.sourceRow, sourceIdentifier: row.identifier, employeeId: row.employeeId, company: row.company, employeeName: row.employeeName, originalEmployeeName: row.originalEmployeeName, department: row.department, serviceDate: row.serviceDate, service: row.service, costCenter: row.costCenter, dailyAmount: row.dailyAmount, previousMonthDifference: row.previousMonthDifference, occasionalDiscounts: row.occasionalDiscounts, days: row.days, locality: "MA", amount: row.amount })) }, issues: { create: preparedIssues.map((issue) => ({ sourceRow: issue.sourceRow, employeeName: issue.employeeName, code: issue.code, message: issue.message, rawData: issue.rawData as Prisma.InputJsonValue, fieldErrors: issue.fieldErrors as Prisma.InputJsonValue, suggestedData: issue.suggestedData as Prisma.InputJsonValue ?? undefined })) } } });
    if (status === "READY") { const record = await createFinancialRecordInTransaction(tx, { administrativeEntityId: input.administrativeEntityId, grossAmount: totalAmount, createdByUserId: input.userId }); await tx.transitVoucherMap.update({ where: { id: map.id }, data: { financialRecordId: record.id } }); }
    return tx.transitVoucherMap.findUniqueOrThrow({ where: { id: map.id }, include: { administrativeEntity: true, financialRecord: true, allocations: { orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } }); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) { await removePrivateFile(stored.storageKey); throw error; }
}

export async function editTransitVoucherMap(mapId: string, rows: Array<{ id: string; company: string; department: string; employeeName: string; amount: string }>) {
  if (!rows.length) throw new TransitVoucherValidationError("Informe ao menos um registro para salvar.");
  const normalized = rows.map((row) => ({ id: row.id, company: row.company.trim().replace(/\s+/g, " "), department: normalizeOrganizationalValue(row.department), employeeName: row.employeeName.trim().replace(/\s+/g, " "), amount: new Prisma.Decimal(row.amount.replace(",", ".")) }));
  if (normalized.some((row) => !row.company || !row.department || !row.employeeName || !row.amount.isFinite())) throw new TransitVoucherValidationError("Empresa, departamento, colaborador e valor total devem ser válidos.");
  return prisma.$transaction(async (tx) => {
    const map = await tx.transitVoucherMap.findUnique({ where: { id: mapId }, include: { allocations: true } });
    if (!map || !map.current) throw new TransitVoucherValidationError("Rateio atual não encontrado.");
    const expected = new Set(map.allocations.map((row) => row.id));
    if (normalized.length !== expected.size || normalized.some((row) => !expected.has(row.id))) throw new TransitVoucherValidationError("O conjunto de registros editados não corresponde ao rateio atual.");
    for (const row of normalized) await tx.transitVoucherAllocation.update({ where: { id: row.id }, data: { company: row.company, department: row.department, employeeName: row.employeeName, amount: row.amount } });
    const totalAmount = normalized.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
    await tx.transitVoucherMap.update({ where: { id: mapId }, data: { totalAmount } });
    if (map.financialRecordId) await tx.financialRecord.update({ where: { id: map.financialRecordId }, data: { grossAmount: totalAmount } });
    return tx.transitVoucherMap.findUniqueOrThrow({ where: { id: mapId }, include: { administrativeEntity: true, financialRecord: true, allocations: { orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveTransitVoucherIssue(input: { mapId: string; issueId: string; userId: string; data: TransitVoucherRawRow }) {
  const parsed = normalizeTransitVoucherCorrection(input.data);
  if (parsed.issues.length || !parsed.allocations[0]) throw new TransitVoucherValidationError(parsed.issues[0]?.message ?? "A correção ainda possui campos inválidos.");
  const corrected = parsed.allocations[0];
  const [employees, aliases] = await Promise.all([prisma.foodEmployee.findMany({ where: { active: true } }), prisma.foodEmployeeAlias.findMany({ include: { employee: true } })]);
  const match = matchFoodEmployee(corrected.employeeName, corrected.department, employees, aliases);
  if (!match.employee) throw new TransitVoucherValidationError("Selecione o nome oficial de um colaborador do Cadastro Mestre.");
  const matchedEmployee=match.employee;
  return prisma.$transaction(async (tx) => {
    const issue = await tx.transitVoucherIssue.findFirst({ where: { id: input.issueId, mapId: input.mapId, resolvedAt: null }, include: { map: true } });
    if (!issue || !issue.map.current) throw new TransitVoucherValidationError("Pendência não encontrada ou já resolvida.");
    const receivedName=String((issue.rawData as Record<string,unknown>|null)?.employeeName??"").trim(); if(receivedName&&normalizeFoodName(receivedName)!==matchedEmployee.normalizedName) await tx.foodEmployeeAlias.upsert({where:{normalizedAlias:normalizeFoodName(receivedName)},create:{employeeId:matchedEmployee.id,sourceName:receivedName,normalizedAlias:normalizeFoodName(receivedName)},update:{employeeId:matchedEmployee.id,sourceName:receivedName}});
    await tx.transitVoucherAllocation.create({ data: { mapId: issue.mapId, competenceId: issue.map.competenceId, administrativeEntityId: issue.map.administrativeEntityId, sourceRow: issue.sourceRow ?? corrected.sourceRow, sourceIdentifier: corrected.identifier, employeeId: matchedEmployee.id, company: corrected.company, employeeName: matchedEmployee.officialName, originalEmployeeName: String((issue.rawData as Record<string, unknown> | null)?.employeeName ?? corrected.employeeName), department: corrected.department, serviceDate: corrected.serviceDate, service: corrected.service, costCenter: corrected.costCenter, dailyAmount: corrected.dailyAmount, previousMonthDifference: corrected.previousMonthDifference, occasionalDiscounts: corrected.occasionalDiscounts, days: corrected.days, locality: issue.map.locality, amount: corrected.amount } });
    await tx.transitVoucherIssue.update({ where: { id: issue.id }, data: { correctedData: input.data as Prisma.InputJsonValue, resolvedAt: new Date(), resolvedByUserId: input.userId } });
    const [aggregate, remaining, validRows] = await Promise.all([tx.transitVoucherAllocation.aggregate({ where: { mapId: issue.mapId }, _sum: { amount: true } }), tx.transitVoucherIssue.count({ where: { mapId: issue.mapId, resolvedAt: null } }), tx.transitVoucherAllocation.count({ where: { mapId: issue.mapId } })]);
    const totalAmount = aggregate._sum.amount ?? new Prisma.Decimal(0); const status = remaining ? "WITH_INCONSISTENCIES" as const : "READY" as const;
    let financialRecordId = issue.map.financialRecordId;
    if (!remaining && !financialRecordId) { const record = await createFinancialRecordInTransaction(tx, { administrativeEntityId: issue.map.administrativeEntityId, grossAmount: totalAmount, createdByUserId: input.userId }); financialRecordId = record.id; }
    else if (financialRecordId) await tx.financialRecord.update({ where: { id: financialRecordId }, data: { grossAmount: totalAmount } });
    await tx.transitVoucherMap.update({ where: { id: issue.mapId }, data: { status, validRows, invalidRows: remaining, totalAmount, financialRecordId } });
    return tx.transitVoucherMap.findUniqueOrThrow({ where: { id: issue.mapId }, include: { administrativeEntity: true, financialRecord: true, allocations: { orderBy: { sourceRow: "asc" } }, issues: { orderBy: { sourceRow: "asc" } } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

type ManualTransitValues = { employeeId:string; dailyAmount?:string; previousMonthDifference?:string; occasionalDiscounts?:string; days?:string; amount:string };
type ManualTransitInput = { year:number; month:number; administrativeEntityId:string; company:string; serviceDate:string; service?:string; entries:ManualTransitValues[]; userId:string };
const normalizedManualKey = (value?:string|null) => (value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export async function addManualTransitVoucher(input: ManualTransitInput) {
  validateCompetence(input.year,input.month);
  const uniqueEntries=[...new Map((input.entries??[]).filter(entry=>entry.employeeId).map(entry=>[entry.employeeId,entry])).values()];
  if(!uniqueEntries.length) throw new TransitVoucherValidationError("Selecione ao menos um colaborador.");
  const [employees,entity]=await Promise.all([prisma.foodEmployee.findMany({where:{id:{in:uniqueEntries.map(entry=>entry.employeeId)},active:true}}),prisma.administrativeEntity.findUnique({where:{id:input.administrativeEntityId}})]);
  if(employees.length!==uniqueEntries.length) throw new TransitVoucherValidationError("Um ou mais colaboradores não estão ativos ou não foram encontrados.");
  if(!entity) throw new TransitVoucherValidationError("Cadastro da obrigação não encontrado.");
  const company=input.company.trim(); const service=input.service?.trim()||null; const date=new Date(`${input.serviceDate}T00:00:00.000Z`);
  if(Number.isNaN(date.getTime())||date.getUTCFullYear()!==input.year||date.getUTCMonth()+1!==input.month) throw new TransitVoucherValidationError("A data deve pertencer à competência.");
  if(!company) throw new TransitVoucherValidationError("Empresa é obrigatória.");
  const decimal=(value?:string)=>{if(!value?.trim())return null;try{const parsed=new Prisma.Decimal(value.replace(",","."));if(!parsed.isFinite())throw new Error();return parsed;}catch{throw new TransitVoucherValidationError("Os valores financeiros informados são inválidos.");}};
  const prepared=uniqueEntries.map(entry=>{const amount=decimal(entry.amount);if(!amount||amount.lte(0))throw new TransitVoucherValidationError("Todos os lançamentos devem possuir Valor total maior que zero.");return{...entry,amount,dailyAmount:decimal(entry.dailyAmount),previousMonthDifference:decimal(entry.previousMonthDifference),occasionalDiscounts:decimal(entry.occasionalDiscounts),days:decimal(entry.days)};});
  const employeeById=new Map(employees.map(employee=>[employee.id,employee]));
  return prisma.$transaction(async tx=>{
    const competence=await tx.transitVoucherCompetence.upsert({where:{year_month:{year:input.year,month:input.month}},create:{year:input.year,month:input.month},update:{}});
    const existing=await tx.transitVoucherAllocation.findMany({where:{competenceId:competence.id,employeeId:{in:prepared.map(entry=>entry.employeeId)},serviceDate:date,deletedAt:null},select:{employeeId:true,employeeName:true,company:true,service:true}});
    const duplicateIds=new Set(existing.filter(row=>normalizedManualKey(row.company)===normalizedManualKey(company)&&normalizedManualKey(row.service)===normalizedManualKey(service)).map(row=>row.employeeId));
    const duplicates=employees.filter(employee=>duplicateIds.has(employee.id)); const accepted=prepared.filter(entry=>!duplicateIds.has(entry.employeeId));
    if(!accepted.length)return{map:null,createdCount:0,duplicateCount:duplicates.length,duplicateNames:duplicates.map(employee=>employee.officialName)};
    let map=await tx.transitVoucherMap.findFirst({where:{competenceId:competence.id,administrativeEntityId:input.administrativeEntityId,current:true,originalName:"Lançamentos manuais"}});
    if(!map){const last=await tx.transitVoucherMap.findFirst({where:{competenceId:competence.id,administrativeEntityId:input.administrativeEntityId},orderBy:{version:"desc"}});map=await tx.transitVoucherMap.create({data:{competenceId:competence.id,administrativeEntityId:input.administrativeEntityId,uploadedByUserId:input.userId,version:(last?.version??0)+1,status:"READY",originalName:"Lançamentos manuais",storageKey:`manual/transit/${competence.id}/${input.administrativeEntityId}`,mimeType:"application/x-manual-entry",sizeBytes:0,sha256:`manual-${competence.id}-${input.administrativeEntityId}`,totalRows:0,validRows:0,invalidRows:0,totalAmount:0}});}
    const source=((await tx.transitVoucherAllocation.aggregate({where:{mapId:map.id},_max:{sourceRow:true}}))._max.sourceRow??0);
    await tx.transitVoucherAllocation.createMany({data:accepted.map((entry,index)=>{const employee=employeeById.get(entry.employeeId)!;return{mapId:map!.id,competenceId:competence.id,administrativeEntityId:input.administrativeEntityId,sourceRow:source+index+1,sourceIdentifier:employee.id,employeeId:employee.id,company,employeeName:employee.officialName,originalEmployeeName:employee.officialName,department:employee.department,serviceDate:date,service,costCenter:employee.costCenter,dailyAmount:entry.dailyAmount,previousMonthDifference:entry.previousMonthDifference,occasionalDiscounts:entry.occasionalDiscounts,days:entry.days,amount:entry.amount,origin:"MANUAL" as const,createdByUserId:input.userId};})});
    const aggregate=await tx.transitVoucherAllocation.aggregate({where:{mapId:map.id},_sum:{amount:true},_count:true});const total=aggregate._sum.amount??new Prisma.Decimal(0);let financialRecordId=map.financialRecordId;if(financialRecordId)await tx.financialRecord.update({where:{id:financialRecordId},data:{grossAmount:total}});else financialRecordId=(await createFinancialRecordInTransaction(tx,{administrativeEntityId:input.administrativeEntityId,grossAmount:total,createdByUserId:input.userId})).id;
    await tx.transitVoucherMap.update({where:{id:map.id},data:{totalRows:aggregate._count,validRows:aggregate._count,totalAmount:total,financialRecordId}});
    const saved=await tx.transitVoucherMap.findUniqueOrThrow({where:{id:map.id},include:{administrativeEntity:true,financialRecord:true,allocations:{orderBy:{sourceRow:"asc"}},issues:true}});
    return{map:saved,createdCount:accepted.length,duplicateCount:duplicates.length,duplicateNames:duplicates.map(employee=>employee.officialName)};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
