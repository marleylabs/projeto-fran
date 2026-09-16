import { readFile } from "node:fs/promises";

const base = "http://localhost:3000";
async function main() {
const email = process.env.VERIFY_EMAIL; const password = process.env.VERIFY_PASSWORD;
if (!email || !password) throw new Error("Defina VERIFY_EMAIL e VERIFY_PASSWORD.");
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`Login falhou: ${login.status}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0]; if (!cookie) throw new Error("Cookie de sessão ausente.");
const headers = { Cookie: cookie };
const entitiesResponse = await fetch(`${base}/api/administrative-entities?q=`, { headers }); const entities = await entitiesResponse.json();
const entity = entities.items?.find((item: { locality: string }) => item.locality.toUpperCase().includes("MA")); if (!entity) throw new Error("Cadastro MA não encontrado.");
const bytes = await readFile("tests/fixtures/Mascara_Vale_Transporte.xlsx"); const form = new FormData(); form.set("year", "2026"); form.set("month", "8"); form.set("administrativeEntityId", entity.id); form.set("file", new File([bytes], "Mascara_Vale_Transporte.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
const upload = await fetch(`${base}/api/accounts-payable/transit-voucher/upload`, { method: "POST", headers, body: form }); const uploaded = await upload.json(); if (!upload.ok) throw new Error(uploaded.error);
if (uploaded.map.invalidRows !== 3) throw new Error(`Esperadas 3 pendências; recebidas ${uploaded.map.invalidRows}.`);
const departments: Record<number, string> = { 3: "SSMA", 6: "FINANCEIRO", 9: "SONDAGEM" };
let current = uploaded.map;
for (const issue of uploaded.map.issues.filter((item: { resolvedAt: string | null }) => !item.resolvedAt)) { const data = { ...issue.rawData, serviceDate: "2026-08-01", department: departments[issue.sourceRow] }; const response = await fetch(`${base}/api/accounts-payable/transit-voucher/${uploaded.map.id}/issues/${issue.id}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ data }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); current = body.map; }
console.log(JSON.stringify({ initialPending: uploaded.map.invalidRows, finalPending: current.invalidRows, validRows: current.validRows, totalAmount: current.totalAmount, status: current.status }));
}
void main();
