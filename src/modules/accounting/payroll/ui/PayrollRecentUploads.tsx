"use client";

// Uploads recentes (histórico de extrações salvas). SÓ APRESENTAÇÃO: abrir chama o PayrollWorkspace, que carrega o
// upload pela API. O agrupamento por competência é o mesmo de antes (Extrato Mensal do mesmo período = 1 linha).
import { FolderOpen } from "lucide-react";
import { Button, DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import { brl } from "./format";

export interface UploadSummary {
  id: string;
  fileName: string;
  formato: string;
  createdAt: string;
  totalColaboradores: number;
  liquidoGeral: number;
  periodoChave?: string | null;
}

interface UploadGroup extends UploadSummary {
  fileNames: string[];
  uploadCount: number;
}

const FORMATO_LABEL: Record<string, string> = {
  "extrato-mensal": "Extrato Mensal",
  "relatorio-sintetico": "Relatório Sintético",
  desconhecido: "Formato desconhecido",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** "06/2026" no Extrato Mensal; "01/05/2026_31/05/2026" no Relatório Sintético (vira "01/05/2026 a 31/05/2026"). */
function periodoLabel(u: UploadSummary): string | null {
  if (!u.periodoChave) return null;
  if (u.formato === "relatorio-sintetico") return `Período ${u.periodoChave.replace("_", " a ")}`;
  return `Competência ${u.periodoChave}`;
}

export function groupUploadsByPeriod(uploads: UploadSummary[]): UploadGroup[] {
  const groups = new Map<string, UploadGroup>();

  for (const upload of uploads) {
    const canGroup = upload.formato === "extrato-mensal" && !!upload.periodoChave;
    const key = canGroup ? `${upload.formato}:${upload.periodoChave}` : upload.id;
    const group = groups.get(key);

    if (!group) {
      groups.set(key, {
        ...upload,
        fileNames: [upload.fileName],
        uploadCount: 1,
      });
      continue;
    }

    group.fileNames.push(upload.fileName);
    group.uploadCount += 1;
    group.totalColaboradores += upload.totalColaboradores;
    group.liquidoGeral += upload.liquidoGeral;

    if (new Date(upload.createdAt) > new Date(group.createdAt)) {
      group.id = upload.id;
      group.createdAt = upload.createdAt;
    }
  }

  return [...groups.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function PayrollRecentUploads({ uploads, onSelect }: { uploads: UploadSummary[]; onSelect: (id: string) => void }) {
  if (uploads.length === 0) return null;
  const rows = groupUploadsByPeriod(uploads);
  const columns: DataTableColumn<UploadGroup>[] = [
    { id: "file", header: "Arquivo", rowHeader: true, sticky: "start", width: "18rem", wrap: true, cell: (u) => (
      <span className="grid min-w-0">
        <span className="break-words">{u.uploadCount > 1 && u.periodoChave ? `Competência ${u.periodoChave} (${u.uploadCount} PDFs)` : u.fileName}</span>
        {u.uploadCount > 1 && <span className="break-words text-caption font-normal text-foreground-muted">{u.fileNames.join(" + ")}</span>}
      </span>
    ) },
    { id: "format", header: "Formato", cell: (u) => <StatusBadge tone={u.formato === "desconhecido" ? "warning" : "neutral"}>{FORMATO_LABEL[u.formato] ?? u.formato}</StatusBadge> },
    { id: "period", header: "Período", cell: (u) => periodoLabel(u) ?? <span className="text-foreground-muted">Não identificado</span> },
    { id: "people", header: "Colaboradores", numeric: true, cell: (u) => u.totalColaboradores },
    { id: "net", header: "Líquido", numeric: true, cell: (u) => brl(u.liquidoGeral) },
    { id: "date", header: "Enviado em", cell: (u) => <span className="tabular-nums">{formatDate(u.createdAt)}</span> },
  ];
  return (
    <DataTable
      caption="Uploads recentes"
      captionVisible
      columns={columns}
      rows={rows}
      getRowId={(u) => u.id}
      density="dense"
      minWidth="820px"
      actionsLabel="Ações"
      rowActions={(u) => <Button size="sm" variant="ghost" onClick={() => onSelect(u.id)} aria-label={`Abrir ${u.fileName}`}><FolderOpen size={14} aria-hidden="true" />Abrir</Button>}
    />
  );
}
