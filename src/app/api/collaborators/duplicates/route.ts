import { NextResponse } from "next/server";import { PERMISSIONS,requirePermission } from "@/lib/auth/permissions";import { findDuplicateCandidates } from "@/modules/collaborators/server";
export async function GET(){const{response}=await requirePermission(PERMISSIONS.MASTER_DATA_READ);if(response)return response;return NextResponse.json({items:await findDuplicateCandidates()});}
