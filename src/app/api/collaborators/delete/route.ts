// /api/collaborators/delete — exclusão em lote de colaboradores, em duas etapas (analyze → execute).
// Chamado pela tela de colaboradores. Permissão base MASTER_DATA_MANAGE (401/403 via requirePermission).
// Corpo JSON: { action: "analyze" | "execute", mode?: "purge", scope?: "all", ids?: string[], confirmation? }.
//  - mode padrão: exclusão comum (deleteCollaboratorsBatch), respeitando vínculos;
//  - mode "purge": exclusão definitiva (purgeCollaborators) — exige papel ADMIN;
//  - scope "all": aplica a toda a base (ids ignorados) — também exige ADMIN.
// Purge executado em mais de um colaborador (ou na base toda) exige a frase "EXCLUIR COLABORADORES" no campo confirmation.
// Erros: 403 sem ADMIN, 400 ação/confirmação inválida ou CollaboratorValidationError, 500 demais.
import { NextResponse } from "next/server";
import { PERMISSIONS,requirePermission,roleKeysOf } from "@/lib/auth/permissions";
import { analyzeCollaboratorDeletion,analyzeCollaboratorPurge,CollaboratorValidationError,deleteCollaboratorsBatch,purgeCollaborators } from "@/modules/collaborators/server";
export async function POST(request:Request){
 // Segurança: além da permissão, purge e limpeza completa checam papel ADMIN explicitamente.
 const{user,response}=await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);if(response||!user)return response;
 try{const body=await request.json();const all=body.scope==="all";
  const purge=body.mode==="purge";
  if(purge&&!roleKeysOf(user).includes("ADMIN"))return NextResponse.json({error:"A exclusão definitiva exige role ADMIN."},{status:403});
  if(all&&!roleKeysOf(user).includes("ADMIN"))return NextResponse.json({error:"A limpeza completa exige role ADMIN."},{status:403});
  if(purge&&body.action==="execute"&&(all||(body.ids?.length??0)>1)&&body.confirmation!=="EXCLUIR COLABORADORES")return NextResponse.json({error:"Digite EXCLUIR COLABORADORES para confirmar."},{status:400});
  const ids=all?undefined:body.ids;
  if(purge&&body.action==="analyze")return NextResponse.json(await analyzeCollaboratorPurge(ids));
  if(purge&&body.action==="execute")return NextResponse.json(await purgeCollaborators(ids));
  if(body.action==="analyze")return NextResponse.json(await analyzeCollaboratorDeletion(ids));
  if(body.action!=="execute")return NextResponse.json({error:"Ação inválida."},{status:400});
  return NextResponse.json(await deleteCollaboratorsBatch(ids));
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível processar os colaboradores."},{status:error instanceof CollaboratorValidationError?400:500})}
}
