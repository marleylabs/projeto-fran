// GET /api/accounts-payable/transit-voucher?year=&month= — competência de Vale Transporte com os mapas vigentes.
// Permissão: FINANCIAL_RECORDS_READ; 401 sem sessão / 403 sem permissão (requirePermission). Saída: { competence }. Erros: 400 TransitVoucherValidationError.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { getTransitVoucherCompetence, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";
export async function GET(request: Request) { const { response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_READ); if (response) return response; const params = new URL(request.url).searchParams; try { return NextResponse.json({ competence: await getTransitVoucherCompetence(Number(params.get("year")), Number(params.get("month"))) }); } catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; } }
