import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getTransitVoucherCompetence, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";
export async function GET(request: Request) { const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response; const params = new URL(request.url).searchParams; try { return NextResponse.json({ competence: await getTransitVoucherCompetence(Number(params.get("year")), Number(params.get("month"))) }); } catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; } }
