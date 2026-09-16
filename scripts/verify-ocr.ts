import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { ocrScannedPdf, terminateOcrWorker } from "../src/modules/documents/server/ocr";

async function main() {
  const patterns: Record<string, string[]> = { "1": ["010", "110", "010", "010", "010", "010", "111"], "2": ["111", "001", "001", "111", "100", "100", "111"], "3": ["111", "001", "001", "111", "001", "001", "111"], "4": ["101", "101", "101", "111", "001", "001", "001"], "5": ["111", "100", "100", "111", "001", "001", "111"] };
  const canvas = createCanvas(900, 360); const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, 900, 360); context.fillStyle = "black";
  [..."12345"].forEach((digit, index) => patterns[digit].forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "1") context.fillRect(70 + index * 150 + x * 35, 50 + y * 35, 35, 35); })));
  const pdf = await PDFDocument.create(); const image = await pdf.embedPng(canvas.toBuffer("image/png")); const page = pdf.addPage([900, 360]); page.drawImage(image, { x: 0, y: 0, width: 900, height: 360 });
  const result = await ocrScannedPdf(Buffer.from(await pdf.save()));
  if (!result.text.trim() || result.pages !== 1) throw new Error("OCR do PDF sintético não retornou texto e página esperados.");
  console.log(JSON.stringify({ text: result.text.trim(), confidence: result.confidence, pages: result.pages, engine: result.engine }));
  await terminateOcrWorker();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
