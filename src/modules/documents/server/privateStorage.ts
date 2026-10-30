import "server-only";
// Armazenamento PRIVADO em disco dos arquivos financeiros anexados (PDF, imagem, XML, XLSX). Diretório:
// PRIVATE_STORAGE_ROOT (padrão ./storage; no Docker é um volume). Nunca servido estaticamente: o download
// passa por /api/financial-files/[fileId], que verifica permissão. Usado pelas rotas de anexos e pelos
// módulos de Alimentação e Vale Transporte. O nome no disco é um UUID; o nome original fica só no banco.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Tamanho máximo aceito por arquivo financeiro: 30 MB. */
export const MAX_FINANCIAL_FILE_SIZE = 30 * 1024 * 1024;
// Tipos aceitos (allowlist). O MIME informado pelo cliente é conferido também pela assinatura do conteúdo.
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "application/xml", "text/xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

/** Nome original seguro para exibição/download: sem diretórios, só letras/dígitos/._- e espaço, até 180 caracteres. */
export function sanitizeOriginalName(name: string) {
  return path.basename(name).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "documento";
}

/**
 * Confere os bytes iniciais (magic numbers) contra o MIME declarado: %PDF-, FF D8 FF (JPEG), PNG, "<" (XML) e
 * PK (ZIP, ou seja, XLSX). Devolve false para MIME fora da allowlist. Não lança erro.
 */
export function validateFileSignature(buffer: Buffer, mimeType: string) {
  if (!MIME_TYPES.has(mimeType)) return false;
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType.includes("xml")) return buffer.subarray(0, 512).toString("utf8").trimStart().startsWith("<");
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function root() { return process.env.PRIVATE_STORAGE_ROOT ?? "storage"; }
// A chave precisa ter formato de UUID: impede path traversal (../) vindo de dados do banco ou da URL.
function resolveKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Chave de armazenamento inválida.");
  return path.join(/*turbopackIgnore: true*/ root(), key);
}

/**
 * Grava o buffer com nome UUID novo (flag wx: nunca sobrescreve; modo 0600) e devolve a chave e o SHA-256,
 * usado para detectar arquivo repetido.
 */
export async function storePrivateFile(buffer: Buffer) {
  await mkdir(root(), { recursive: true });
  const storageKey = randomUUID();
  await writeFile(resolveKey(storageKey), buffer, { flag: "wx", mode: 0o600 });
  return { storageKey, sha256: createHash("sha256").update(buffer).digest("hex") };
}
/** Lê o arquivo pela chave. Lança erro se a chave for inválida ou o arquivo não existir. */
export async function readPrivateFile(key: string) { return readFile(resolveKey(key)); }
/** Remove o arquivo; ausência não é erro (idempotente), útil para desfazer upload em caso de falha. */
export async function removePrivateFile(key: string) { await unlink(resolveKey(key)).catch(() => undefined); }
