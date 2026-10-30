// POST /api/accounts-payable/transit-voucher/manual — lançamento manual antigo de VT (addManualTransitVoucher,
// transit-voucher/server). Sem chamador na UI atual: a tela usa /entries.
// Permissão: FINANCIAL_RECORDS_CREATE; 401 sem sessão / 403 sem permissão (requirePermission). Entrada: JSON de ManualTransitInput; userId vem da sessão
// (aplicado depois do spread, não sobrescrevível). Saída: 201. Erros: 400 TransitVoucherValidationError.
import { NextResponse } from "next/server"; import { PERMISSIONS,requirePermission } from "@/lib/auth/permissions"; import { addManualTransitVoucher,TransitVoucherValidationError } from "@/modules/accounts-payable/transit-voucher/server";
export async function POST(request:Request){const{user,response}=await requirePermission(PERMISSIONS.FINANCIAL_RECORDS_CREATE);if(response||!user)return response;try{return NextResponse.json(await addManualTransitVoucher({...await request.json(),userId:user.id}),{status:201});}catch(error){if(error instanceof TransitVoucherValidationError)return NextResponse.json({error:error.message},{status:400});throw error;}}
