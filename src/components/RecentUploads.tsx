"use client";

import { formatBRNumber } from "@/lib/normalize/money";

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

function groupUploadsByPeriod(uploads: UploadSummary[]): UploadGroup[] {
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

export function RecentUploads({ uploads, onSelect }: { uploads: UploadSummary[]; onSelect: (id: string) => void }) {
  if (uploads.length === 0) return null;

  const groupedUploads = groupUploadsByPeriod(uploads);

  return (
    <div className="card w-full max-w-xl p-4">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Uploads recentes</h2>
      <ul className="divide-y divide-border">
        {groupedUploads.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => onSelect(u.id)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-surface-soft rounded-md px-2 -mx-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {u.uploadCount > 1 && u.periodoChave ? `Competência ${u.periodoChave} (${u.uploadCount} PDFs)` : u.fileName}
                </p>
                <p className="text-xs text-text-muted">
                  {FORMATO_LABEL[u.formato] ?? u.formato}
                  {periodoLabel(u) && ` · ${periodoLabel(u)}`} · {u.totalColaboradores} colaborador(es) ·{" "}
                  {formatDate(u.createdAt)}
                </p>
                {u.uploadCount > 1 && (
                  <p className="text-xs text-text-muted truncate mt-0.5">{u.fileNames.join(" + ")}</p>
                )}
              </div>
              <span className="text-sm font-medium text-primary whitespace-nowrap">R$ {formatBRNumber(u.liquidoGeral)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
