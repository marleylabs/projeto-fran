import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const email = process.env.VERIFY_EMAIL;
const password = process.env.VERIFY_PASSWORD;
const source = process.env.VERIFY_PA_FILE;
if (!email || !password || !source)
  throw new Error("Defina VERIFY_EMAIL, VERIFY_PASSWORD e VERIFY_PA_FILE.");
const sourcePath: string = source;
const base = "http://localhost:3000";
async function json(response: Response) {
  const value = await response.json();
  if (!response.ok)
    throw new Error(`${response.status}: ${JSON.stringify(value)}`);
  return value;
}
async function main() {
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await json(login);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const headers = { Cookie: cookie };
  const entities = (
    await json(
      await fetch(`${base}/api/administrative-entities?q=`, { headers }),
    )
  ).items;
  const supplier = entities.find(
    (item: { tradeName: string }) => item.tradeName === "REI DO ASSADO",
  );
  assert.ok(supplier);
  const price = await json(
    await fetch(`${base}/api/accounts-payable/food/price`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        administrativeEntityId: supplier.id,
        unitPrice: "30",
        year: 2026,
        month: 8,
      }),
    }),
  );
  const form = new FormData();
  form.set("year", "2026");
  form.set("month", "8");
  form.set("locality", "PA");
  form.set("administrativeEntityId", supplier.id);
  form.set(
    "file",
    new File([await readFile(sourcePath)], "RATEIO REI DO ASSADO ATUAL.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const draft = (
    await json(
      await fetch(`${base}/api/accounts-payable/food/upload`, {
        method: "POST",
        headers,
        body: form,
      }),
    )
  ).batch;
  assert.equal(draft.status, "UNDER_REVIEW");
  assert.equal(draft.competence.year, 2026);
  assert.equal(draft.competence.month, 6);
  assert.equal(draft.mealOccurrences.length, 161);
  assert.equal(
    new Set(
      draft.mealOccurrences.map(
        (row: { normalizedReceivedName: string }) => row.normalizedReceivedName,
      ),
    ).size,
    22,
  );
  assert.equal(draft.issues.length, 0);
  const groups = new Map<
    string,
    {
      normalizedReceivedName: string;
      officialName: string;
      department: string;
      duplicateAction: "KEEP_ALL";
    }
  >();
  for (const row of draft.mealOccurrences)
    groups.set(row.normalizedReceivedName, {
      normalizedReceivedName: row.normalizedReceivedName,
      officialName: row.receivedName,
      department: row.receivedDepartment,
      duplicateAction: "KEEP_ALL",
    });
  const ready = (
    await json(
      await fetch(`${base}/api/accounts-payable/food/${draft.id}/finalize`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions: [...groups.values()] }),
      }),
    )
  ).batch;
  assert.equal(ready.status, "READY");
  assert.equal(ready.validRows, 161);
  assert.equal(Number(ready.totalAmount), 4830);
  assert.equal(ready.allocations.length, 22);
  assert.equal(
    ready.allocations
      .filter(
        (row: { department: string }) => row.department === "ENGENHARIA SALOBO",
      )
      .reduce(
        (sum: number, row: { amount: string }) => sum + Number(row.amount),
        0,
      ),
    3930,
  );
  assert.equal(
    ready.allocations
      .filter(
        (row: { department: string }) => row.department === "TOPOGRAFIA BMSA",
      )
      .reduce(
        (sum: number, row: { amount: string }) => sum + Number(row.amount),
        0,
      ),
    900,
  );
  const editRows = ready.mealOccurrences.map(
    (
      row: {
        id: string;
        employeeId: string;
        officialName: string;
        confirmedDepartment: string;
      },
      index: number,
    ) => ({
      occurrenceId: row.id,
      employeeId: row.employeeId,
      officialName: row.officialName,
      department: row.confirmedDepartment,
      disposition: index === 0 ? "IGNORED" : "VALID",
    }),
  );
  const edited = (
    await json(
      await fetch(`${base}/api/accounts-payable/food/${draft.id}/edit`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ edits: editRows }),
      }),
    )
  ).batch;
  assert.equal(edited.validRows, 160);
  assert.equal(Number(edited.totalAmount), 4800);
  assert.equal(Number(edited.financialRecord.grossAmount), 4800);
  const restoredRows = edited.mealOccurrences.map(
    (row: {
      id: string;
      employeeId: string;
      officialName: string;
      confirmedDepartment: string;
    }) => ({
      occurrenceId: row.id,
      employeeId: row.employeeId,
      officialName: row.officialName,
      department: row.confirmedDepartment,
      disposition: "VALID",
    }),
  );
  const restored = (
    await json(
      await fetch(`${base}/api/accounts-payable/food/${draft.id}/edit`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ edits: restoredRows }),
      }),
    )
  ).batch;
  assert.equal(restored.validRows, 161);
  assert.equal(Number(restored.totalAmount), 4830);
  assert.equal(Number(restored.financialRecord.grossAmount), 4830);
  assert.equal(restored.revisions.length, 2);
  const download = await fetch(
    `${base}/api/accounts-payable/food/${draft.id}/download`,
    { headers },
  );
  assert.equal(download.status, 200);
  assert.ok((await download.arrayBuffer()).byteLength > 10000);
  console.log(
    JSON.stringify({
      batchId: draft.id,
      financialRecordId: ready.financialRecord?.id,
      priceConfigId: price.config?.id ?? price.id,
      employees: 22,
      meals: 161,
      total: ready.totalAmount,
      download: "ok",
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
