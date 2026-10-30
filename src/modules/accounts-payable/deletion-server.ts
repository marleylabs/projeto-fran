import "server-only";
// Exclusão/cancelamento de lançamentos de Contas a Pagar (Alimentação, Vale Transporte, Café da Manhã,
// Cesta Básica, Plano de Saúde). Chamado pelas rotas DELETE em src/app/api/accounts-payable/** e por
// src/modules/collaborators/server.ts (recalculateFoodBatch/recalculateTransitMap).
// Regras gerais:
//   - Soft delete: linhas recebem deletedAt/deletedByUserId/deletionReason; nada é apagado fisicamente
//     (exceto FoodAllocation, que é derivada e reconstruída a partir das ocorrências).
//   - Só é possível excluir enquanto a obrigação financeira (FinancialRecord) não avançou no fluxo
//     (ver assertDeletable). Depois de paga/conciliada/contabilizada, a exclusão é bloqueada.
//   - Quando o lote/mapa fica vazio, a obrigação é cancelada e zerada e o lote sai de vigência (current=false).
//   - Toda operação roda em transação Serializable para evitar corrida com edição/finalização concorrente.
//   - Valores em Prisma.Decimal (nunca float).
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";

/** Erro de regra de negócio da exclusão; as rotas o convertem em resposta 4xx com a mensagem ao usuário. */
export class AccountsPayableDeletionError extends Error {}
type Tx = Prisma.TransactionClient;

// Bloqueia a exclusão se a obrigação vinculada já saiu do estado inicial (ACTIVE + tudo PENDING).
// Sem obrigação vinculada (null) a exclusão é permitida.
function assertDeletable(record: { lifecycleState:string; paymentState:string; reconciliationState:string; accountingState:string } | null) {
  if (!record) return;
  if (record.lifecycleState !== "ACTIVE" || record.paymentState !== "PENDING" || record.reconciliationState !== "PENDING" || record.accountingState !== "PENDING")
    throw new AccountsPayableDeletionError("Este registro já avançou no fluxo financeiro e não pode ser excluído diretamente.");
}

// Cancela a obrigação financeira: zera o valor bruto e marca CANCELLED (o registro e o identificador PG-* permanecem).
async function cancelFinancialRecord(tx:Tx,id:string|null) {
  if (!id) return;
  await tx.financialRecord.update({where:{id},data:{grossAmount:0,lifecycleState:"CANCELLED",paymentState:"CANCELLED"}});
}

/**
 * Recalcula um lote de Alimentação depois de ocorrências serem excluídas/editadas (deve rodar dentro de `tx`).
 * - Reagrupa as ocorrências vigentes (included e não excluídas) por colaborador + setor confirmado e
 *   reconstrói FoodAllocation (apaga e recria); ocorrências sem colaborador/setor confirmados não entram no rateio.
 * - unitPrice da alocação = valor do grupo ÷ quantidade de refeições (Decimal).
 * - Atualiza grossAmount da obrigação e os totais do lote. Se não sobrar nenhuma ocorrência, cancela a
 *   obrigação e tira o lote de vigência.
 * Lança AccountsPayableDeletionError se o lote não existe ou a obrigação já avançou no fluxo.
 * Retorna quantidade de refeições restantes e o total (string decimal).
 */
export async function recalculateFoodBatch(tx:Tx,batchId:string) {
  const batch=await tx.foodBatch.findUnique({where:{id:batchId},include:{financialRecord:true}});
  if(!batch)throw new AccountsPayableDeletionError("Lote de Alimentação não encontrado."); assertDeletable(batch.financialRecord);
  const occurrences=await tx.foodMealOccurrence.findMany({where:{batchId,included:true,deletedAt:null},orderBy:{sourceRow:"asc"}});
  const groups=new Map<string,{employeeId:string;name:string;department:string;first:number;count:number;amount:Prisma.Decimal}>();
  for(const row of occurrences){if(!row.employeeId||!row.officialName||!row.confirmedDepartment)continue;const key=`${row.employeeId}|${row.confirmedDepartment}`;const value=groups.get(key)??{employeeId:row.employeeId,name:row.officialName,department:row.confirmedDepartment,first:row.sourceRow,count:0,amount:new Prisma.Decimal(0)};value.count+=row.mealQuantity;value.amount=value.amount.add(row.amount);groups.set(key,value);}
  await tx.foodAllocation.deleteMany({where:{batchId}});
  if(groups.size)await tx.foodAllocation.createMany({data:[...groups.values()].map(row=>({batchId,competenceId:batch.competenceId,administrativeEntityId:batch.administrativeEntityId,sourceRow:row.first,sourceIdentifier:row.employeeId,employeeName:row.name,department:row.department,locality:batch.locality,unitPrice:row.amount.div(row.count),amount:row.amount}))});
  const total=occurrences.reduce((sum,row)=>sum.add(row.amount),new Prisma.Decimal(0));const totalMeals=occurrences.reduce((sum,row)=>sum+row.mealQuantity,0);
  if(!occurrences.length){await cancelFinancialRecord(tx,batch.financialRecordId);await tx.foodBatch.update({where:{id:batchId},data:{current:false,cancelledAt:new Date(),validRows:0,totalAmount:0}});}
  else{if(batch.financialRecordId)await tx.financialRecord.update({where:{id:batch.financialRecordId},data:{grossAmount:total}});await tx.foodBatch.update({where:{id:batchId},data:{validRows:totalMeals,totalRows:totalMeals,totalAmount:total}});}
  return{remaining:totalMeals,total:total.toString()};
}

/**
 * Exclui (soft delete) ocorrências selecionadas de um lote de Alimentação ativo e recalcula o lote.
 * O motivo é opcional. Lança AccountsPayableDeletionError se nada foi selecionado, o lote não está vigente,
 * a obrigação já avançou ou nenhuma das ocorrências estava vigente.
 */
export async function deleteFoodOccurrences(input:{batchId:string;ids:string[];userId:string;reason?:string}) {
  const ids=[...new Set(input.ids.filter(Boolean))];if(!ids.length)throw new AccountsPayableDeletionError("Selecione ao menos uma ocorrência.");
  return prisma.$transaction(async tx=>{const batch=await tx.foodBatch.findUnique({where:{id:input.batchId},include:{financialRecord:true}});if(!batch||!batch.current||batch.cancelledAt)throw new AccountsPayableDeletionError("Lote ativo não encontrado.");assertDeletable(batch.financialRecord);const result=await tx.foodMealOccurrence.updateMany({where:{id:{in:ids},batchId:input.batchId,deletedAt:null},data:{included:false,deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason?.trim()||null}});if(!result.count)throw new AccountsPayableDeletionError("Nenhuma ocorrência vigente foi encontrada.");const summary=await recalculateFoodBatch(tx,input.batchId);return{deletedCount:result.count,...summary};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

/**
 * Exclui o lote de Alimentação inteiro (motivo obrigatório): marca todas as ocorrências como excluídas,
 * apaga as alocações derivadas, cancela a obrigação e tira o lote de vigência, registrando quem e por quê.
 */
export async function cancelFoodBatch(input:{batchId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do lote.");
  return prisma.$transaction(async tx=>{const batch=await tx.foodBatch.findUnique({where:{id:input.batchId},include:{financialRecord:true}});if(!batch||!batch.current||batch.cancelledAt)throw new AccountsPayableDeletionError("Lote ativo não encontrado.");assertDeletable(batch.financialRecord);await tx.foodMealOccurrence.updateMany({where:{batchId:input.batchId,deletedAt:null},data:{included:false,deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason.trim()}});await tx.foodAllocation.deleteMany({where:{batchId:input.batchId}});await cancelFinancialRecord(tx,batch.financialRecordId);await tx.foodBatch.update({where:{id:input.batchId},data:{current:false,cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim(),validRows:0,totalAmount:0}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

/**
 * Equivalente de recalculateFoodBatch para Vale Transporte: soma as alocações vigentes (aggregate no banco,
 * Decimal) e atualiza obrigação/mapa; se não sobrar nenhuma, cancela a obrigação e o mapa. Deve rodar dentro de `tx`.
 */
export async function recalculateTransitMap(tx:Tx,mapId:string) {
  const map=await tx.transitVoucherMap.findUnique({where:{id:mapId},include:{financialRecord:true}});if(!map)throw new AccountsPayableDeletionError("Processamento de Vale Transporte não encontrado.");assertDeletable(map.financialRecord);
  const aggregate=await tx.transitVoucherAllocation.aggregate({where:{mapId,deletedAt:null},_sum:{amount:true},_count:true});const total=aggregate._sum.amount??new Prisma.Decimal(0);
  if(!aggregate._count){await cancelFinancialRecord(tx,map.financialRecordId);await tx.transitVoucherMap.update({where:{id:mapId},data:{current:false,cancelledAt:new Date(),validRows:0,totalAmount:0}});}
  else{if(map.financialRecordId)await tx.financialRecord.update({where:{id:map.financialRecordId},data:{grossAmount:total}});await tx.transitVoucherMap.update({where:{id:mapId},data:{validRows:aggregate._count,totalAmount:total}});}
  return{remaining:aggregate._count,total:total.toString()};
}

/** Exclui (soft delete) alocações selecionadas de um mapa de Vale Transporte ativo e recalcula o mapa. */
export async function deleteTransitAllocations(input:{mapId:string;ids:string[];userId:string;reason?:string}) {
  const ids=[...new Set(input.ids.filter(Boolean))];if(!ids.length)throw new AccountsPayableDeletionError("Selecione ao menos um registro.");
  return prisma.$transaction(async tx=>{const map=await tx.transitVoucherMap.findUnique({where:{id:input.mapId},include:{financialRecord:true}});if(!map||!map.current||map.cancelledAt)throw new AccountsPayableDeletionError("Processamento ativo não encontrado.");assertDeletable(map.financialRecord);const result=await tx.transitVoucherAllocation.updateMany({where:{id:{in:ids},mapId:input.mapId,deletedAt:null},data:{deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason?.trim()||null}});if(!result.count)throw new AccountsPayableDeletionError("Nenhum registro vigente foi encontrado.");const summary=await recalculateTransitMap(tx,input.mapId);return{deletedCount:result.count,...summary};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

/** Exclui o processamento de Vale Transporte inteiro (motivo obrigatório): soft delete das alocações + cancelamento da obrigação. */
export async function cancelTransitMap(input:{mapId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do processamento.");
  return prisma.$transaction(async tx=>{const map=await tx.transitVoucherMap.findUnique({where:{id:input.mapId},include:{financialRecord:true}});if(!map||!map.current||map.cancelledAt)throw new AccountsPayableDeletionError("Processamento ativo não encontrado.");assertDeletable(map.financialRecord);await tx.transitVoucherAllocation.updateMany({where:{mapId:input.mapId,deletedAt:null},data:{deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason.trim()}});await cancelFinancialRecord(tx,map.financialRecordId);await tx.transitVoucherMap.update({where:{id:input.mapId},data:{current:false,cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim(),validRows:0,totalAmount:0}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

/** Café da Manhã: exclui o lançamento inteiro (motivo obrigatório); não há exclusão parcial de linhas. */
export async function cancelBreakfastMap(input:{mapId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do lançamento.");
  return prisma.$transaction(async tx=>{const map=await tx.breakfastMap.findUnique({where:{id:input.mapId},include:{financialRecord:true}});if(!map||!map.current||map.cancelledAt)throw new AccountsPayableDeletionError("Lançamento ativo não encontrado.");assertDeletable(map.financialRecord);await tx.breakfastAllocation.updateMany({where:{mapId:input.mapId,deletedAt:null},data:{deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason.trim()}});await cancelFinancialRecord(tx,map.financialRecordId);await tx.breakfastMap.update({where:{id:input.mapId},data:{current:false,cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim(),validRows:0,totalAmount:0}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

// Cesta Básica: mesmo soft cancel do Café da Manhã — linhas marcadas como excluídas (com motivo), obrigação
// cancelada e zerada, mapa sai de vigência. Nada é apagado fisicamente.
export async function cancelBasicBasketMap(input:{mapId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do lançamento.");
  return prisma.$transaction(async tx=>{const map=await tx.basicBasketMap.findUnique({where:{id:input.mapId},include:{financialRecord:true}});if(!map||!map.current||map.cancelledAt)throw new AccountsPayableDeletionError("Lançamento ativo não encontrado.");assertDeletable(map.financialRecord);await tx.basicBasketAllocation.updateMany({where:{mapId:input.mapId,deletedAt:null},data:{deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason.trim()}});await cancelFinancialRecord(tx,map.financialRecordId);await tx.basicBasketMap.update({where:{id:input.mapId},data:{current:false,cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim(),totalRows:0,totalAmount:0}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
// Plano de Saúde: cancela a fatura (PDF) inteira — obrigação cancelada e zerada, fatura sai do rateio. As linhas dos
// titulares ficam como histórico da fatura cancelada (nada é apagado fisicamente).
export async function cancelHealthPlanInvoice(input:{invoiceId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do lançamento.");
  return prisma.$transaction(async tx=>{const invoice=await tx.healthPlanInvoice.findUnique({where:{id:input.invoiceId},include:{financialRecord:true}});if(!invoice||invoice.cancelledAt)throw new AccountsPayableDeletionError("Fatura ativa não encontrada.");assertDeletable(invoice.financialRecord);await cancelFinancialRecord(tx,invoice.financialRecordId);await tx.healthPlanInvoice.update({where:{id:input.invoiceId},data:{cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim()}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
