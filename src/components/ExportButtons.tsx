"use client";

import { useState } from "react";
import type { ExtractionResult } from "@/lib/types/payroll";
import type { SinteticoResult } from "@/lib/types/sintetico";
import { exportExcel } from "@/lib/export/excel";
import { exportCsv } from "@/lib/export/csv";
import { exportJson } from "@/lib/export/json";
import { exportSinteticoExcel, exportSinteticoCsv, exportSinteticoJson } from "@/lib/export/sinteticoExport";
import { Button } from "@/components/ui";

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
      <Button variant="secondary" onClick={handleExcel} loading={exportingExcel}>
        Exportar Excel
      </Button>
      <Button variant="secondary" onClick={() => (isSintetico ? exportSinteticoCsv(result) : exportCsv(result.colaboradores))}>
        Exportar CSV
      </Button>
      <Button variant="secondary" onClick={() => (isSintetico ? exportSinteticoJson(result) : exportJson(result))}>
        Exportar JSON
      </Button>
    </div>
  );
}
