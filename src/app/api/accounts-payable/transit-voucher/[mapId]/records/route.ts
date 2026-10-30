// DELETE /api/accounts-payable/transit-voucher/[mapId]/records — exclusão lógica das alocações selecionadas do
// mapa de Vale Transporte (deleteTransitAllocations, deletion-server), com recálculo do total; sem linhas, a
// obrigação é cancelada. Permissão: FINANCIAL_RECORDS_DELETE; 401 sem sessão / 403 sem permissão (requirePermission).
// Entrada (JSON): { ids: string[], reason? }. Erros: 409 AccountsPayableDeletionError.
import { NextResponse } from "next/server";
import { PERMISSIONS,requirePermission } from "@/lib/auth/permissions";
import { AccountsPayableDeletionError,deleteTransitAllocations } from "@/modules/accounts-payable/deletion-server";
export async function DELETE(request:Request,context:{params:Promise<{mapId:string}>}){const{user,response}=await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_DELETE);if(response||!user)return response;const{mapId}=await context.params;const body=await request.json().catch(()=>null) as {ids?:string[];reason?:string}|null;try{return NextResponse.json(await deleteTransitAllocations({mapId,ids:body?.ids??[],reason:body?.reason,userId:user.id}));}catch(error){if(error instanceof AccountsPayableDeletionError)return NextResponse.json({error:error.message},{status:409});throw error;}}
