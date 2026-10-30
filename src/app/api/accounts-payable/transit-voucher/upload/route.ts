// POST /api/accounts-payable/transit-voucher/upload — importação de mapa de Vale Transporte por arquivo
// (processTransitVoucherMap). Sem chamador na UI atual (VT é lançado manualmente em /entries).
// Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission).
// Entrada multipart: file, year, month, administrativeEntityId. Saída: 201 { map }.
// Erros: 400 arquivo inválido ou TransitVoucherValidationError.
import { NextResponse } from "next/server";
import { PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { processTransitVoucherMap, TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";
export const runtime = "nodejs"; function isFile(value: FormDataEntryValue | null | undefined): value is File { return typeof value === "object" && value !== null && "name" in value && "size" in value && "arrayBuffer" in value && typeof value.arrayBuffer === "function"; }
export async function POST(request: Request) { const { user, response } = await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE); if (response || !user) return response; const form = await request.formData().catch(() => null); const file = form?.get("file"); if (!isFile(file)) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 }); try { const map = await processTransitVoucherMap({ year: Number(form?.get("year")), month: Number(form?.get("month")), administrativeEntityId: String(form?.get("administrativeEntityId") ?? ""), userId: user.id, file }); return NextResponse.json({ map }, { status: 201 }); } catch (error) { if (error instanceof TransitVoucherValidationError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; } }
