"use client";

// Exportações da extração (Excel/CSV/JSON). Só dispara os exportadores existentes em src/lib/export — conteúdo e nomes
// dos arquivos inalterados.
import { useState } from "react";
import { Download } from "lucide-react";
import type { ExtractionResult } from "@/lib/types/payroll";
import type { SinteticoResult } from "@/lib/types/sintetico";
import { exportExcel } from "@/lib/export/excel";
import { exportCsv } from "@/lib/export/csv";
import { exportJson } from "@/lib/export/json";
import { exportSinteticoExcel, exportSinteticoCsv, exportSinteticoJson } from "@/lib/export/sinteticoExport";
import { Button } from "@/components/ui";

export function PayrollExportActions({ result }: { result: ExtractionResult | SinteticoResult }) {
  const [exportingExcel, setExportingExcel] = useState(false);
  const isSintetico = result.formato === "relatorio-sintetico";

  const handleExcel = async () => {
    setExportingExcel(true);
    try {
      if (isSintetico) await exportSinteticoExcel(result);
      else await exportExcel(result);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Exportar extração">
      <Button size="sm" variant="secondary" onClick={handleExcel} loading={exportingExcel}><Download size={14} aria-hidden="true" />Excel</Button>
      <Button size="sm" variant="ghost" onClick={() => (isSintetico ? exportSinteticoCsv(result) : exportCsv(result.colaboradores))}>CSV</Button>
      <Button size="sm" variant="ghost" onClick={() => (isSintetico ? exportSinteticoJson(result) : exportJson(result))}>JSON</Button>
    </div>
  );
}
