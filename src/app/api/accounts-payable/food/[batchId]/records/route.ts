// /api/accounts-payable/food/[batchId]/records — ocorrências (refeições) de um lote de Alimentação.
import { NextResponse } from "next/server";
import { PERMISSIONS,requirePermission } from "@/lib/auth/permissions";
import { AccountsPayableDeletionError,deleteFoodOccurrences } from "@/modules/accounts-payable/deletion-server";
import { FoodBatchValidationError,getFoodBatchOccurrences } from "@/modules/accounts-payable/food/server";
// GET — lista as ocorrências do lote (getFoodBatchOccurrences). Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission).
// Saída: { occurrences }. Erros: 404 FoodBatchValidationError.
export async function GET(_:Request,context:{params:Promise<{batchId:string}>}){const{response}=await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ);if(response)return response;const{batchId}=await context.params;try{return NextResponse.json({occurrences:await getFoodBatchOccurrences(batchId)});}catch(error){if(error instanceof FoodBatchValidationError)return NextResponse.json({error:error.message},{status:404});throw error;}}
// DELETE — exclusão lógica das ocorrências selecionadas (deleteFoodOccurrences, deletion-server), com
// recálculo do lote. Permissão: FINANCIAL_RECORDS_DELETE; 401 sem sessão / 403 sem permissão (requirePermission). Entrada (JSON): { ids: string[], reason? }.
// Erros: 409 AccountsPayableDeletionError (nenhum id, lote não vigente ou obrigação que não pode mais ser alterada).
export async function DELETE(request:Request,context:{params:Promise<{batchId:string}>}){const{user,response}=await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_DELETE);if(response||!user)return response;const{batchId}=await context.params;const body=await request.json().catch(()=>null) as {ids?:string[];reason?:string}|null;try{return NextResponse.json(await deleteFoodOccurrences({batchId,ids:body?.ids??[],reason:body?.reason,userId:user.id}));}catch(error){if(error instanceof AccountsPayableDeletionError)return NextResponse.json({error:error.message},{status:409});throw error;}}
