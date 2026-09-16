import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_FINANCIAL_FILE_SIZE = 30 * 1024 * 1024;
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "application/xml", "text/xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

export function sanitizeOriginalName(name: string) {
  return path.basename(name).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "documento";
}

export function validateFileSignature(buffer: Buffer, mimeType: string) {
  if (!MIME_TYPES.has(mimeType)) return false;
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType.includes("xml")) return buffer.subarray(0, 512).toString("utf8").trimStart().startsWith("<");
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function root() { return process.env.PRIVATE_STORAGE_ROOT ?? "storage"; }
function resolveKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Chave de armazenamento inválida.");
  return path.join(/*turbopackIgnore: true*/ root(), key);
}

export async function storePrivateFile(buffer: Buffer) {
  await mkdir(root(), { recursive: true });
  const storageKey = randomUUID();
  await writeFile(resolveKey(storageKey), buffer, { flag: "wx", mode: 0o600 });
  return { storageKey, sha256: createHash("sha256").update(buffer).digest("hex") };
}
export async function readPrivateFile(key: string) { return readFile(resolveKey(key)); }
export async function removePrivateFile(key: string) { await unlink(resolveKey(key)).catch(() => undefined); }
