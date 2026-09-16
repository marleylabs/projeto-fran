import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { createWorker, OEM, type Worker } from "tesseract.js";

type OcrResult = { text: string; confidence: number; pages: number; engine: string };
let workerPromise: Promise<Worker> | null = null;

function getWorker() {
  workerPromise ??= createWorker(["por", "eng"], OEM.LSTM_ONLY, {
    cachePath: process.env.OCR_CACHE_PATH ?? ".cache/tesseract",
    logger: (event) => { if (event.status === "recognizing text" && event.progress === 1) console.log("OCR: página concluída"); },
  });
  return workerPromise;
}

async function recognizeImages(images: Buffer[]): Promise<OcrResult> {
  const worker = await getWorker(); const texts: string[] = []; const confidences: number[] = [];
  for (const image of images) {
    const result = await worker.recognize(image, { rotateAuto: true });
    texts.push(result.data.text); confidences.push(result.data.confidence / 100);
  }
  return { text: texts.join("\n\n--- PAGE BREAK ---\n\n"), confidence: confidences.reduce((sum, value) => sum + value, 0) / Math.max(1, confidences.length), pages: images.length, engine: "tesseract-wasm-por+eng" };
}

export async function ocrImage(buffer: Buffer) { return recognizeImages([buffer]); }

export async function ocrScannedPdf(buffer: Buffer): Promise<OcrResult> {
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true } as never).promise;
  if (document.numPages > 25) throw new Error("PDF excede o limite de 25 páginas para OCR automático.");
  const images: Buffer[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number); const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport } as never).promise;
    images.push(canvas.toBuffer("image/png"));
  }
  return recognizeImages(images);
}

export async function terminateOcrWorker() { if (workerPromise) await (await workerPromise).terminate(); workerPromise = null; }
