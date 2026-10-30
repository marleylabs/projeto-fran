// /api/collaborators/bulk — ativa/inativa vários colaboradores de uma vez (seleção em massa da tela de colaboradores).
// PATCH; permissão MASTER_DATA_MANAGE (401/403); corpo JSON { ids: string[], active: boolean }.
// Retorna o resultado de bulkSetCollaboratorStatus; 400 em CollaboratorValidationError, 500 demais erros.
import { NextResponse } from "next/server";import { PERMISSIONS,requirePermission } from "@/lib/auth/permissions";import { bulkSetCollaboratorStatus,CollaboratorValidationError } from "@/modules/collaborators/server";
export async function PATCH(request:Request){const{response}=await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);if(response)return response;try{const{ids,active}=await request.json();return NextResponse.json(await bulkSetCollaboratorStatus(ids,Boolean(active)));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao atualizar colaboradores."},{status:error instanceof CollaboratorValidationError?400:500});}}
