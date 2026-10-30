import type { ExtractionResult } from "@/lib/types/payroll";
import { triggerDownload } from "./download";

/** Baixa no navegador o resultado completo da extração (Extrato Mensal) como JSON indentado. Inclui dados pessoais. */
export function exportJson(result: ExtractionResult, filename = "extrato-mensal.json") {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}
