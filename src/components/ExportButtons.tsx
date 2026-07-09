"use client";

import { useState } from "react";
import type { ExtractionResult } from "@/lib/types/payroll";
import type { SinteticoResult } from "@/lib/types/sintetico";
import { exportExcel } from "@/lib/export/excel";
import { exportCsv } from "@/lib/export/csv";
import { exportJson } from "@/lib/export/json";
import { exportSinteticoExcel, exportSinteticoCsv, exportSinteticoJson } from "@/lib/export/sinteticoExport";

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-soft disabled:opacity-50 disabled:cursor-not-allowed";

export function ExportButtons({ result }: { result: ExtractionResult | SinteticoResult }) {
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
    <div className="flex flex-wrap gap-2">
      <button className={BUTTON_CLASS} onClick={handleExcel} disabled={exportingExcel}>
        {exportingExcel ? "Gerando..." : "Exportar Excel"}
      </button>
      <button className={BUTTON_CLASS} onClick={() => (isSintetico ? exportSinteticoCsv(result) : exportCsv(result.colaboradores))}>
        Exportar CSV
      </button>
      <button className={BUTTON_CLASS} onClick={() => (isSintetico ? exportSinteticoJson(result) : exportJson(result))}>
        Exportar JSON
      </button>
    </div>
  );
}
