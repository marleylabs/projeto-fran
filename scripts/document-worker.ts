// Worker de extração de documentos financeiros (processo separado do Next.js).
// Execução: serviço "document-worker" do docker-compose.yml (npx tsx scripts/document-worker.ts) ou localmente
// com o mesmo comando. Consome a fila DocumentExtractionJob (jobs criados no upload/reprocessamento de
// arquivos em /api/financial-records/[id]/files e /api/financial-files/[fileId]/reprocess).
// Para cada job: lê o arquivo do armazenamento privado (PRIVATE_STORAGE_ROOT), extrai texto (PDF nativo via
// pdfjs, PDF escaneado/imagem via OCR, XML direto), classifica o tipo de documento, extrai campos básicos
// (CNPJ, datas, valores, chave de acesso) e grava DocumentExtraction; o FinancialRecord passa para validação.
// Encerramento gracioso: SIGTERM/SIGINT só ligam a flag `stopping`; o job em andamento termina antes de sair.
import "dotenv/config";
import { hostname } from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db/prisma";
import { extractPdfRows, rowText } from "../src/lib/pdf/extractRows";
import { ocrImage, ocrScannedPdf, terminateOcrWorker } from "../src/modules/documents/server/ocr";

// Identifica quem travou o job (lockedBy): host + PID, único por processo.
const workerId = `${hostname()}-${process.pid}`;
const storageRoot = path.resolve(process.env.PRIVATE_STORAGE_ROOT ?? "./storage");
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

// Tipo do documento: o tipo informado no upload (kind) tem prioridade; senão, palavras-chave do texto.
// Retorna o próprio kind quando nada casa.
function classify(text: string, kind: string) {
  if (kind === "BOLETO" || /linha digitável|código de barras/i.test(text)) return "BOLETO";
  if (kind === "RECEIPT" || /comprovante|autenticação|transação/i.test(text)) return "COMPROVANTE";
  if (kind === "INVOICE" || /invoice|balance due|payment terms/i.test(text)) return "INVOICE";
  if (kind === "TAX_INVOICE" || /nota fiscal|chave de acesso|nfs-e/i.test(text)) return "NOTA_FISCAL";
  return kind;
}

// Extração heurística por regex (sem validação semântica): primeiro CNPJ, até 10 datas dd/mm/aaaa,
// até 20 valores com moeda e uma chave de acesso de NF-e (44 dígitos). Resultado vai para structuredData
// e é conferido por uma pessoa na revisão.
function structuredFields(text: string) {
  const taxId = text.match(/\b\d{2}\.?\d{3}\.?\d{3}[/\-]?\d{4}-?\d{2}\b/)?.[0] ?? null;
  const dates = [...text.matchAll(/\b\d{2}[\/.]\d{2}[\/.]\d{4}\b/g)].slice(0, 10).map((match) => match[0]);
  const amounts = [...text.matchAll(/(?:R\$|USD|US\$|\$)\s*[\d.,]+/gi)].slice(0, 20).map((match) => match[0]);
  const accessKey = text.replace(/\D/g, " ").match(/\b\d{44}\b/)?.[0] ?? null;
  return { taxId, taxIdValid: taxId ? isValidCnpj(taxId) : null, dates, amounts, accessKey, accessKeyValid: accessKey ? accessKey.length === 44 : null };
}

// Validação dos dígitos verificadores do CNPJ (rejeita sequências de dígitos repetidos).
function isValidCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const digit = (size: number) => { let sum = 0; let weight = size - 7; for (let i = 0; i < size; i += 1) { sum += Number(digits[i]) * weight--; if (weight === 1) weight = 9; } const result = 11 - (sum % 11); return result > 9 ? 0 : result; };
  return digit(12) === Number(digits[12]) && digit(13) === Number(digits[13]);
}

// Reserva o job pendente mais antigo. O updateMany condicionado a state=PENDING funciona como trava
// otimista: se dois workers pegarem o mesmo job, só um consegue (count === 1) e o outro recebe null.
// O job devolvido é o lido ANTES do incremento, por isso processJob usa `job.attempts + 1`.
async function claim() {
  return prisma.$transaction(async (tx) => {
    const job = await tx.documentExtractionJob.findFirst({ where: { state: "PENDING", availableAt: { lte: new Date() } }, include: { file: { include: { financialRecord: true } } }, orderBy: { createdAt: "asc" } });
    if (!job) return null;
    const claimed = await tx.documentExtractionJob.updateMany({ where: { id: job.id, state: "PENDING" }, data: { state: "PROCESSING", lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 } } });
    return claimed.count === 1 ? job : null;
  });
}

// Processa um job reservado. OCR com confiança < 0,65 fica REVIEW_REQUIRED; tipos sem extrator
// (ex.: planilhas) ficam como "metadata-only" e também exigem revisão.
// Em erro: volta para PENDING com nova tentativa em 30 s até maxAttempts, depois FAILED; a mensagem e a
// stack são truncadas para caber nas colunas. O FinancialRecord não é alterado no caso de erro.
async function processJob(job: NonNullable<Awaited<ReturnType<typeof claim>>>) {
  try {
    const bytes = await readFile(path.join(storageRoot, job.file.storageKey));
    let rawText = ""; let engine = "metadata-only"; let state: "SUCCESS" | "REVIEW_REQUIRED" = "REVIEW_REQUIRED";
    let extractionConfidence = 0.75;
    if (job.file.mimeType === "application/pdf") {
      const extracted = await extractPdfRows(bytes);
      rawText = extracted.pages.flatMap((page) => page.rows.map(rowText)).join("\n");
      if (extracted.hasExtractableText) { engine = "pdfjs-native"; state = "SUCCESS"; }
      else { const ocr = await ocrScannedPdf(bytes); rawText = ocr.text; engine = ocr.engine; extractionConfidence = ocr.confidence; state = ocr.confidence >= 0.65 ? "SUCCESS" : "REVIEW_REQUIRED"; }
    } else if (job.file.mimeType.startsWith("image/")) {
      const ocr = await ocrImage(bytes); rawText = ocr.text; engine = ocr.engine; extractionConfidence = ocr.confidence; state = ocr.confidence >= 0.65 ? "SUCCESS" : "REVIEW_REQUIRED";
    } else if (job.file.mimeType.includes("xml")) { rawText = bytes.toString("utf8"); engine = "xml-native"; state = "SUCCESS"; }
    const data = structuredFields(rawText); const documentType = classify(rawText, job.file.kind);
    // Confianças fixas por campo (heurística), apenas para orientar a tela de revisão.
    const confidence = { documentType: rawText ? 0.9 : 0.5, taxId: data.taxId ? 0.85 : 0, dates: data.dates.length ? 0.75 : 0, amounts: data.amounts.length ? 0.7 : 0 };
    // Grava extração, conclui o job e libera o registro financeiro para validação de forma atômica.
    await prisma.$transaction([
      prisma.documentExtraction.create({ data: { jobId: job.id, fileId: job.fileId, state, engine, engineVersion: "1", language: /invoice|payment terms/i.test(rawText) ? "en-US" : "pt-BR", documentType, rawText: rawText || null, structuredData: data, fieldConfidences: confidence, overallConfidence: rawText ? extractionConfidence : 0.25 } }),
      prisma.documentExtractionJob.update({ where: { id: job.id }, data: { state, completedAt: new Date(), lockedBy: null } }),
      prisma.financialRecord.update({ where: { id: job.file.financialRecordId }, data: { extractionState: "COMPLETED", validationState: "PENDING" } }),
    ]);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    const retry = job.attempts + 1 < job.maxAttempts;
    await prisma.documentExtractionJob.update({ where: { id: job.id }, data: { state: retry ? "PENDING" : "FAILED", availableAt: new Date(Date.now() + 30_000), lockedBy: null, errorStage: "PROCESSING", errorMessage: error.message.slice(0, 1000), technicalStack: error.stack?.slice(0, 8000), completedAt: retry ? null : new Date() } });
  }
}

// Laço principal: a cada volta devolve à fila jobs PROCESSING há mais de 10 min (worker que morreu no meio),
// tenta reservar um job e, se a fila estiver vazia, espera 3 s.
async function main() {
  console.log(`Worker documental iniciado: ${workerId}`);
  while (!stopping) {
    await prisma.documentExtractionJob.updateMany({ where: { state: "PROCESSING", startedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { state: "PENDING", lockedBy: null, errorStage: "LEASE_EXPIRED", errorMessage: "Processamento interrompido; job devolvido à fila." } });
    const job = await claim(); if (job) await processJob(job); else await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  await terminateOcrWorker(); await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
