"use client";

// Última extração de folha salva (primeiro item de GET /api/uploads, ordem do servidor: createdAt desc). SÓ APRESENTAÇÃO
// dos campos reais do upload — sem status nem progresso (a extração é síncrona e não guarda estado de processamento).
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, EmptyState, FeedbackAlert, SkeletonCard, SkeletonGroup, StatusBadge, buttonClassName } from "@/components/ui";
import { formatBRNumber } from "@/lib/normalize/money";
import type { UploadSummary } from "@/modules/accounting/payroll/ui/PayrollRecentUploads";

const FORMATO_LABEL: Record<string, string> = { "extrato-mensal": "Extrato Mensal", "relatorio-sintetico": "Relatório Sintético", desconhecido: "Formato desconhecido" };

function periodo(upload: UploadSummary) {
  if (!upload.periodoChave) return null;
  return upload.formato === "relatorio-sintetico" ? upload.periodoChave.replace("_", " a ") : upload.periodoChave;
}

export function DashboardPayrollLatest({ upload, loading, error }: { upload: UploadSummary | null; loading: boolean; error: string | null }) {
  return (
    <Card as="section" aria-labelledby="home-payroll-latest" className="grid min-w-0 content-start gap-3">
      <CardHeader
        title={<span id="home-payroll-latest">Última extração da folha</span>}
        actions={<Link href="/contabilidade/folha" className={buttonClassName({ variant: "ghost", size: "sm" })}>Folha<ArrowRight size={14} aria-hidden="true" /></Link>}
      />
      {loading ? (
        <SkeletonGroup label="Carregando a última extração da folha"><SkeletonCard lines={3} /></SkeletonGroup>
      ) : error ? (
        <FeedbackAlert status="error">{error}</FeedbackAlert>
      ) : !upload ? (
        <EmptyState title="Nenhuma extração registrada" description="Envie o PDF do Extrato Mensal na Folha para começar." />
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={upload.formato === "desconhecido" ? "warning" : "neutral"}>{FORMATO_LABEL[upload.formato] ?? upload.formato}</StatusBadge>
            <span className="min-w-0 break-words text-body font-medium">{upload.fileName}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {([
              [upload.formato === "relatorio-sintetico" ? "Período" : "Competência", periodo(upload) ?? "Não identificada"],
              ["Colaboradores", String(upload.totalColaboradores)],
              ["Líquido extraído", `R$ ${formatBRNumber(upload.liquidoGeral)}`],
              ["Enviado em", new Date(upload.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5"><dt className="text-caption text-foreground-muted">{label}</dt><dd className="text-body font-semibold tabular-nums">{value}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}
