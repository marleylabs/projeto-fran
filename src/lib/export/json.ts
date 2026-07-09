import type { ExtractionResult } from "@/lib/types/payroll";
import { triggerDownload } from "./download";

export function exportJson(result: ExtractionResult, filename = "extrato-mensal.json") {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}
