// /api/collaborators/duplicates — candidatos a colaboradores duplicados (nomes parecidos) para revisão/mesclagem.
// GET; permissão MASTER_DATA_READ (401/403); retorna { items } de findDuplicateCandidates.
import { NextResponse } from "next/server";import { PERMISSIONS,requirePermission } from "@/lib/auth/permissions";import { findDuplicateCandidates } from "@/modules/collaborators/server";
export async function GET(){const{response}=await requirePermission(PERMISSIONS.MASTER_DATA_READ);if(response)return response;return NextResponse.json({items:await findDuplicateCandidates()});}
