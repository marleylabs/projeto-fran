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

export function RecentUploads({ uploads, onSelect }: { uploads: UploadSummary[]; onSelect: (id: string) => void }) {
  if (uploads.length === 0) return null;

  return (
    <div className="card w-full max-w-xl p-4">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Uploads recentes</h2>
      <ul className="divide-y divide-border">
        {uploads.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => onSelect(u.id)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-surface-soft rounded-md px-2 -mx-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{u.fileName}</p>
                <p className="text-xs text-text-muted">
                  {FORMATO_LABEL[u.formato] ?? u.formato}
                  {periodoLabel(u) && ` · ${periodoLabel(u)}`} · {u.totalColaboradores} colaborador(es) ·{" "}
                  {formatDate(u.createdAt)}
                </p>
              </div>
              <span className="text-sm font-medium text-primary whitespace-nowrap">R$ {formatBRNumber(u.liquidoGeral)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
