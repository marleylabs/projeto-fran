import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";

export class AccountsPayableDeletionError extends Error {}
type Tx = Prisma.TransactionClient;

function assertDeletable(record: { lifecycleState:string; paymentState:string; reconciliationState:string; accountingState:string } | null) {
  if (!record) return;
  if (record.lifecycleState !== "ACTIVE" || record.paymentState !== "PENDING" || record.reconciliationState !== "PENDING" || record.accountingState !== "PENDING")
    throw new AccountsPayableDeletionError("Este registro já avançou no fluxo financeiro e não pode ser excluído diretamente.");
}

async function cancelFinancialRecord(tx:Tx,id:string|null) {
  if (!id) return;
  await tx.financialRecord.update({where:{id},data:{grossAmount:0,lifecycleState:"CANCELLED",paymentState:"CANCELLED"}});
}

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

export async function deleteFoodOccurrences(input:{batchId:string;ids:string[];userId:string;reason?:string}) {
  const ids=[...new Set(input.ids.filter(Boolean))];if(!ids.length)throw new AccountsPayableDeletionError("Selecione ao menos uma ocorrência.");
  return prisma.$transaction(async tx=>{const batch=await tx.foodBatch.findUnique({where:{id:input.batchId},include:{financialRecord:true}});if(!batch||!batch.current||batch.cancelledAt)throw new AccountsPayableDeletionError("Lote ativo não encontrado.");assertDeletable(batch.financialRecord);const result=await tx.foodMealOccurrence.updateMany({where:{id:{in:ids},batchId:input.batchId,deletedAt:null},data:{included:false,deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason?.trim()||null}});if(!result.count)throw new AccountsPayableDeletionError("Nenhuma ocorrência vigente foi encontrada.");const summary=await recalculateFoodBatch(tx,input.batchId);return{deletedCount:result.count,...summary};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function cancelFoodBatch(input:{batchId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do lote.");
  return prisma.$transaction(async tx=>{const batch=await tx.foodBatch.findUnique({where:{id:input.batchId},include:{financialRecord:true}});if(!batch||!batch.current||batch.cancelledAt)throw new AccountsPayableDeletionError("Lote ativo não encontrado.");assertDeletable(batch.financialRecord);await tx.foodMealOccurrence.updateMany({where:{batchId:input.batchId,deletedAt:null},data:{included:false,deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason.trim()}});await tx.foodAllocation.deleteMany({where:{batchId:input.batchId}});await cancelFinancialRecord(tx,batch.financialRecordId);await tx.foodBatch.update({where:{id:input.batchId},data:{current:false,cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim(),validRows:0,totalAmount:0}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function recalculateTransitMap(tx:Tx,mapId:string) {
  const map=await tx.transitVoucherMap.findUnique({where:{id:mapId},include:{financialRecord:true}});if(!map)throw new AccountsPayableDeletionError("Processamento de Vale Transporte não encontrado.");assertDeletable(map.financialRecord);
  const aggregate=await tx.transitVoucherAllocation.aggregate({where:{mapId,deletedAt:null},_sum:{amount:true},_count:true});const total=aggregate._sum.amount??new Prisma.Decimal(0);
  if(!aggregate._count){await cancelFinancialRecord(tx,map.financialRecordId);await tx.transitVoucherMap.update({where:{id:mapId},data:{current:false,cancelledAt:new Date(),validRows:0,totalAmount:0}});}
  else{if(map.financialRecordId)await tx.financialRecord.update({where:{id:map.financialRecordId},data:{grossAmount:total}});await tx.transitVoucherMap.update({where:{id:mapId},data:{validRows:aggregate._count,totalAmount:total}});}
  return{remaining:aggregate._count,total:total.toString()};
}

export async function deleteTransitAllocations(input:{mapId:string;ids:string[];userId:string;reason?:string}) {
  const ids=[...new Set(input.ids.filter(Boolean))];if(!ids.length)throw new AccountsPayableDeletionError("Selecione ao menos um registro.");
  return prisma.$transaction(async tx=>{const map=await tx.transitVoucherMap.findUnique({where:{id:input.mapId},include:{financialRecord:true}});if(!map||!map.current||map.cancelledAt)throw new AccountsPayableDeletionError("Processamento ativo não encontrado.");assertDeletable(map.financialRecord);const result=await tx.transitVoucherAllocation.updateMany({where:{id:{in:ids},mapId:input.mapId,deletedAt:null},data:{deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason?.trim()||null}});if(!result.count)throw new AccountsPayableDeletionError("Nenhum registro vigente foi encontrado.");const summary=await recalculateTransitMap(tx,input.mapId);return{deletedCount:result.count,...summary};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function cancelTransitMap(input:{mapId:string;userId:string;reason:string}) {
  if(!input.reason.trim())throw new AccountsPayableDeletionError("Informe o motivo da exclusão do processamento.");
  return prisma.$transaction(async tx=>{const map=await tx.transitVoucherMap.findUnique({where:{id:input.mapId},include:{financialRecord:true}});if(!map||!map.current||map.cancelledAt)throw new AccountsPayableDeletionError("Processamento ativo não encontrado.");assertDeletable(map.financialRecord);await tx.transitVoucherAllocation.updateMany({where:{mapId:input.mapId,deletedAt:null},data:{deletedAt:new Date(),deletedByUserId:input.userId,deletionReason:input.reason.trim()}});await cancelFinancialRecord(tx,map.financialRecordId);await tx.transitVoucherMap.update({where:{id:input.mapId},data:{current:false,cancelledAt:new Date(),cancelledByUserId:input.userId,cancellationReason:input.reason.trim(),validRows:0,totalAmount:0}});return{cancelled:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
