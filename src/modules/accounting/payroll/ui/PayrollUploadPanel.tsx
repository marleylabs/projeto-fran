"use client";

// Envio do PDF da folha. SÓ APRESENTAÇÃO: o envio (XHR /api/extract), duplicidade e estados ficam no PayrollWorkspace.
// Progresso: o percentual mostrado é o do ENVIO (real); durante a leitura/extração no servidor não há dado de progresso,
// então o estado é indeterminado (sem porcentagem inventada).
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Card, FeedbackAlert, UploadDropzone, type UploadFileLike } from "@/components/ui";

export type PayrollUploadStage = "idle" | "uploading" | "processing" | "error";

// Mesmo limite e formatos aceitos pelo servidor (/api/extract: PDF até 30 MB).
const ACCEPT = "application/pdf,.pdf";
const MAX_SIZE = 30 * 1024 * 1024;

export function PayrollUploadPanel({ stage, file, uploadPercent, errorMessage, onFileSelect }: { stage: PayrollUploadStage; file: UploadFileLike | null; uploadPercent: number; errorMessage: string | null; onFileSelect: (file: File) => void }) {
  const busy = stage === "uploading" || stage === "processing";
  return (
    <Card className="grid gap-4">
      <UploadDropzone
        label="PDF da folha (Extrato Mensal ou Relatório Sintético)"
        file={file}
        onFileSelect={onFileSelect}
        accept={ACCEPT}
        maxSize={MAX_SIZE}
        disabled={busy}
        helperText="A leitura usa o texto do PDF e, quando necessário, OCR."
      />
      {busy && (
        <div role="status" aria-live="polite" className="grid gap-2">
          <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body" aria-label="Etapas do processamento">
            <li className="flex items-center gap-1.5">
              {stage === "uploading" ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin text-primary motion-reduce:animate-none" /> : <CheckCircle2 size={16} aria-hidden="true" className="text-success-text" />}
              <span>Envio{stage === "uploading" ? ` · ${Math.round(uploadPercent)}%` : " concluído"}</span>
            </li>
            <li className="flex items-center gap-1.5 text-foreground-muted data-[active=true]:text-foreground" data-active={stage === "processing"}>
              {stage === "processing" && <LoaderCircle size={16} aria-hidden="true" className="animate-spin text-primary motion-reduce:animate-none" />}
              <span>Leitura e extração dos colaboradores</span>
            </li>
          </ol>
          {stage === "uploading" ? (
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Envio do arquivo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadPercent)}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.min(100, Math.max(0, uploadPercent))}%` }} />
            </div>
          ) : (
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Leitura e extração em andamento">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" />
            </div>
          )}
        </div>
      )}
      {stage === "error" && errorMessage && <FeedbackAlert status="error" title="Não foi possível extrair a folha">{errorMessage}</FeedbackAlert>}
    </Card>
  );
}
