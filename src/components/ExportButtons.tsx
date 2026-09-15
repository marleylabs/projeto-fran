"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileJson, FileType } from "lucide-react";
import type { ExtractionResult } from "@/lib/types/payroll";
import type { SinteticoResult } from "@/lib/types/sintetico";
import { exportExcel } from "@/lib/export/excel";
import { exportCsv } from "@/lib/export/csv";
import { exportJson } from "@/lib/export/json";
import { exportSinteticoExcel, exportSinteticoCsv, exportSinteticoJson } from "@/lib/export/sinteticoExport";

export function ExportButtons({ result }: { result: ExtractionResult | SinteticoResult }) {
  const [exportingExcel, setExportingExcel] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSintetico = result.formato === "relatorio-sintetico";

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleExcel = async () => {
    setOpen(false);
    setExportingExcel(true);
    try {
      if (isSintetico) await exportSinteticoExcel(result);
      else await exportExcel(result);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleCsv = () => {
    setOpen(false);
    if (isSintetico) exportSinteticoCsv(result);
    else exportCsv(result.colaboradores);
  };

  const handleJson = () => {
    setOpen(false);
    if (isSintetico) exportSinteticoJson(result);
    else exportJson(result);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={exportingExcel}
        className="btn btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="w-4 h-4" strokeWidth={1.75} />
        {exportingExcel ? "Gerando..." : "Exportar"}
        <ChevronDown className="w-3.5 h-3.5 text-text-subtle" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-48 card p-1 flex flex-col"
        >
          <button role="menuitem" onClick={handleExcel} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-surface-soft text-left">
            <FileSpreadsheet className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
            Excel (.xlsx)
          </button>
          <button role="menuitem" onClick={handleCsv} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-surface-soft text-left">
            <FileType className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
            CSV
          </button>
          <button role="menuitem" onClick={handleJson} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-surface-soft text-left">
            <FileJson className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
            JSON
          </button>
        </div>
      )}
    </div>
  );
}
