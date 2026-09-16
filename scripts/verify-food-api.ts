export {};

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const email = process.env.VERIFY_EMAIL;
const password = process.env.VERIFY_PASSWORD;
if (!email || !password) throw new Error("Defina VERIFY_EMAIL e VERIFY_PASSWORD.");

async function json(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
await json(loginResponse);
const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Cookie de sessão não recebido.");
const headers = { Cookie: cookie };
const entityBody = await json(await fetch(`${baseUrl}/api/administrative-entities?q=`, { headers }));
const entities = entityBody.items as Array<{ id: string; tradeName: string }>;
const tia = entities.find((item) => item.tradeName === "TIA LIKA");
const rei = entities.find((item) => item.tradeName === "REI DO ASSADO");
if (!tia || !rei) throw new Error("Cadastros de teste MA/PA não encontrados.");

async function upload(locality: "MA" | "PA", entityId: string, year: number, month: number, csv: string, name: string) {
  const form = new FormData(); form.set("year", String(year)); form.set("month", String(month)); form.set("locality", locality); form.set("administrativeEntityId", entityId);
  form.set("file", new Blob([csv], { type: "text/csv" }), name);
  const response = await fetch(`${baseUrl}/api/accounts-payable/food/upload`, { method: "POST", headers, body: form });
  const body = await response.json();
  return { status: response.status, body };
}
async function price(entityId: string, unitPrice: string) {
  return json(await fetch(`${baseUrl}/api/accounts-payable/food/price`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ administrativeEntityId: entityId, unitPrice, year: 2026, month: 8 }) }));
}

const csv = (count: number, prefix: string) => ["Matrícula;Colaborador;Setor", ...Array.from({ length: count }, (_, index) => `${prefix}${index + 1};Colaborador ${prefix} ${index + 1};${index % 2 ? "Financeiro" : "Engenharia"}`)].join("\n");
await price(tia.id, "25"); await price(rei.id, "28.5");
const supplierA = await upload("MA", tia.id, 2026, 8, csv(40, "A"), "fornecedor-a.csv");
const supplierB = await upload("MA", rei.id, 2026, 8, csv(30, "B"), "fornecedor-b.csv");
if (supplierA.status !== 201 || supplierB.status !== 201) throw new Error(JSON.stringify({ supplierA, supplierB }));
const competence = await json(await fetch(`${baseUrl}/api/accounts-payable/food?year=2026&month=8`, { headers }));
const batches = competence.competence.batches as Array<{ id: string; locality: string; validRows: number; totalAmount: string }>;
const batchA = batches.find((batch) => batch.id === supplierA.body.batch.id)!; const batchB = batches.find((batch) => batch.id === supplierB.body.batch.id)!;
const downloads = await Promise.all([
  fetch(`${baseUrl}/api/accounts-payable/food/${batchA.id}/download`, { headers }),
  fetch(`${baseUrl}/api/accounts-payable/food/${batchB.id}/download`, { headers }),
  fetch(`${baseUrl}/api/accounts-payable/food/consolidated/download?year=2026&month=8`, { headers }),
]);
const result = {
  supplierA: { valid: supplierA.body.batch.validRows, unitPrice: supplierA.body.batch.unitPrice, amount: supplierA.body.batch.totalAmount, obligation: supplierA.body.batch.financialRecord?.identifier },
  supplierB: { valid: supplierB.body.batch.validRows, unitPrice: supplierB.body.batch.unitPrice, amount: supplierB.body.batch.totalAmount, obligation: supplierB.body.batch.financialRecord?.identifier },
  consolidated: { people: batches.reduce((sum, batch) => sum + batch.validRows, 0), amount: batches.reduce((sum, batch) => sum + Number(batch.totalAmount), 0) },
  downloads: await Promise.all(downloads.map(async (response) => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))),
  batchIds: [supplierA.body.batch.id, supplierB.body.batch.id],
};
console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
