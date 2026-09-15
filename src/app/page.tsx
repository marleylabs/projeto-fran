"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileText, RefreshCcw } from "lucide-react";
import type { Colaborador } from "@/lib/types/payroll";
import type { PayrollExtractionResult } from "@/lib/parser/router";
import { computeTotaisGerais } from "@/lib/parser/computeTotals";
import { uploadPdf, type DuplicateExisting } from "@/lib/uploadWithProgress";
import { AppHeader } from "@/components/ui/AppHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { FileUpload } from "@/components/FileUpload";
import { ProgressBar } from "@/components/ProgressBar";
import { SummaryCards } from "@/components/SummaryCards";
import { SinteticoSummaryCards } from "@/components/SinteticoSummaryCards";
import { Filters, EMPTY_FILTERS, type FiltersState } from "@/components/Filters";
import { EmployeeTable } from "@/components/EmployeeTable";
import { SinteticoTable } from "@/components/SinteticoTable";
import { EmployeeDetailModal } from "@/components/EmployeeDetailModal";
import { ExportButtons } from "@/components/ExportButtons";
import { RecentUploads, type UploadSummary } from "@/components/RecentUploads";
import { DuplicateUploadModal } from "@/components/DuplicateUploadModal";

type Stage = "idle" | "uploading" | "processing" | "error";

const LAST_UPLOAD_KEY = "extratoMensal:currentUploadId";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PayrollExtractionResult | null>(null);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [sinteticoBusca, setSinteticoBusca] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [restoring, setRestoring] = useState(true);
  const [recentUploads, setRecentUploads] = useState<UploadSummary[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [duplicateExisting, setDuplicateExisting] = useState<DuplicateExisting | null>(null);

  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRecentUploads = () => {
    fetch("/api/uploads")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setRecentUploads(json.uploads ?? []))
      .catch(() => setRecentUploads([]));
  };

  // Ao carregar a página, restaura a última extração vista (guardada no banco) em vez
  // de sempre voltar para a tela de upload — o usuário reclamou que recarregar a
  // página perdia o que ele tinha acabado de processar.
  useEffect(() => {
    const lastId = localStorage.getItem(LAST_UPLOAD_KEY);

    const restore = lastId
      ? fetch(`/api/uploads/${lastId}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((data: PayrollExtractionResult) => setResult(data))
          .catch(() => {
            localStorage.removeItem(LAST_UPLOAD_KEY);
            loadRecentUploads();
          })
      : Promise.resolve().then(() => loadRecentUploads());

    restore.finally(() => setRestoring(false));
  }, []);

  const runUpload = async (file: File, duplicateAction?: "replace" | "keep_both") => {
    setStage("uploading");
    setErrorMessage(null);
    setResult(null);
    setProgress(0);
    setFileName(file.name);
    setFileSize(file.size);

    try {
      const outcome = await uploadPdf(
        file,
        (uploadPercent) => {
          const mapped = uploadPercent * 0.5;
          setProgress(mapped);
          if (uploadPercent >= 100) {
            setStage("processing");
            if (!processingIntervalRef.current) {
              processingIntervalRef.current = setInterval(() => {
                setProgress((p) => (p < 92 ? p + (92 - p) * 0.08 : p));
              }, 200);
            }
          }
        },
        duplicateAction
      );

      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }

      if (outcome.status === "duplicate") {
        setPendingFile(file);
        setDuplicateExisting(outcome.existing);
        setStage("idle");
        return;
      }

      const data = outcome.data;
      setProgress(100);
      setResult(data);
      if (data.id) localStorage.setItem(LAST_UPLOAD_KEY, data.id);

      const isEmpty =
        data.formato === "desconhecido" ||
        (data.formato === "extrato-mensal" && data.colaboradores.length === 0) ||
        (data.formato === "relatorio-sintetico" && data.linhas.length === 0);

      setStage(isEmpty ? "error" : "idle");
      if (isEmpty && data.avisos.length > 0) {
        setErrorMessage(data.avisos[0]);
      }
    } catch (err) {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao processar o PDF.");
    }
  };

  const handleFileSelected = (file: File) => {
    runUpload(file);
  };

  const handleDuplicateDecision = (action: "replace" | "keep_both" | "cancel") => {
    const file = pendingFile;
    setDuplicateExisting(null);
    setPendingFile(null);
    if (action === "cancel" || !file) {
      setStage("idle");
      return;
    }
    runUpload(file, action);
  };

  const handleSelectRecent = (id: string) => {
    setRestoring(true);
    fetch(`/api/uploads/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PayrollExtractionResult) => {
        setResult(data);
        localStorage.setItem(LAST_UPLOAD_KEY, id);
      })
      .catch(() => setErrorMessage("Não foi possível carregar esse upload."))
      .finally(() => setRestoring(false));
  };

  const extrato = result?.formato === "extrato-mensal" ? result : null;
  const sintetico = result?.formato === "relatorio-sintetico" ? result : null;

  const situacoesDisponiveis = useMemo(() => {
    if (!extrato) return [];
    return [...new Set(extrato.colaboradores.map((c) => c.situacao).filter(Boolean))];
  }, [extrato]);

  const empresasDisponiveis = useMemo(() => {
    if (!extrato) return [];
    return [...new Set(extrato.colaboradores.map((c) => c.empresaNome || extrato.empresa.nome).filter(Boolean))].sort();
  }, [extrato]);

  const filteredColaboradores = useMemo(() => {
    if (!extrato) return [];
    const f = filters;
    return extrato.colaboradores.filter((c) => {
      const empresaNome = c.empresaNome || extrato.empresa.nome;
      if (f.empresa && empresaNome !== f.empresa) return false;
      if (f.nome && !c.nome.toLowerCase().includes(f.nome.toLowerCase())) return false;
      if (f.cpf && !c.cpf.includes(f.cpf)) return false;
      if (f.cargo && !c.cargo.toLowerCase().includes(f.cargo.toLowerCase())) return false;
      if (f.departamento && c.departamento !== f.departamento && !c.departamento.includes(f.departamento)) return false;
      if (f.centroCusto && c.centroCusto !== f.centroCusto && !c.centroCusto.includes(f.centroCusto)) return false;
      if (f.situacao && c.situacao !== f.situacao) return false;
      return true;
    });
  }, [extrato, filters]);

  const filteredLinhas = useMemo(() => {
    if (!sintetico) return [];
    const termo = sinteticoBusca.trim().toLowerCase();
    if (!termo) return sintetico.linhas;
    return sintetico.linhas.filter((l) => l.nome.toLowerCase().includes(termo) || l.mat.includes(termo));
  }, [sintetico, sinteticoBusca]);

  const selectedColaborador = extrato?.colaboradores.find((c) => c.id === selectedId) ?? null;

  const handleSaveColaborador = (updated: Colaborador) => {
    if (!extrato) return;
    const colaboradores = extrato.colaboradores.map((c) => (c.id === updated.id ? updated : c));
    setResult({ ...extrato, colaboradores, totaisGerais: computeTotaisGerais(colaboradores) });
  };

  const reset = () => {
    setStage("idle");
    setResult(null);
    setErrorMessage(null);
    setProgress(0);
    setFilters(EMPTY_FILTERS);
    setSinteticoBusca("");
    localStorage.removeItem(LAST_UPLOAD_KEY);
    loadRecentUploads();
  };

  const isBusy = stage === "uploading" || stage === "processing";

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />

      <main className="flex-1 page-container py-6 sm:py-8 flex flex-col gap-6">
        <PageHeader
          title="Extração de folha de pagamento"
          description="Importe um arquivo PDF para processar e analisar os dados."
          actions={
            result && (
              <button onClick={reset} className="btn btn-secondary btn-sm">
                <RefreshCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                Novo upload
              </button>
            )
          }
        />

        {restoring && (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-text-muted">Carregando...</div>
        )}

        {!restoring && !result && (
          <div className="flex-1 flex flex-col items-center gap-6 py-6">
            <FileUpload onFileSelected={handleFileSelected} disabled={isBusy} />

            {isBusy && (
              <div className="card w-full max-w-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <FileText className="w-4.5 h-4.5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                  <p className="text-xs text-text-muted mb-1.5">{formatFileSize(fileSize)}</p>
                  <ProgressBar
                    percent={progress}
                    label={stage === "uploading" ? "Enviando..." : "Lendo PDF e extraindo colaboradores..."}
                  />
                </div>
              </div>
            )}

            {stage === "error" && errorMessage && (
              <div className="w-full max-w-xl rounded-lg bg-danger-soft text-danger-strong text-sm px-4 py-3 flex gap-2.5">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <p className="font-medium">Não foi possível processar o arquivo.</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            <RecentUploads uploads={recentUploads} onSelect={handleSelectRecent} />
          </div>
        )}

        {extrato && extrato.colaboradores.length > 0 && (
          <>
            {extrato.avisos.length > 0 && (
              <details className="card p-4 text-sm text-warning-strong bg-warning-soft border-0">
                <summary className="cursor-pointer font-medium">
                  {extrato.avisos.length} aviso(s) de leitura — revisar antes de exportar
                </summary>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {extrato.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.75} />
                <span className="font-medium text-foreground truncate">
                  {extrato.consolidado ? extrato.empresa.nome : `${extrato.empresa.nome} · CNPJ ${extrato.empresa.cnpj}`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <Badge variant="neutral">Competência {extrato.empresa.competencia}</Badge>
                {extrato.consolidado && <Badge variant="neutral">{empresasDisponiveis.length} empresa(s)</Badge>}
                <Badge variant={extrato.metodoLeitura === "texto" ? "success" : "warning"}>
                  Leitura por {extrato.metodoLeitura === "texto" ? "texto" : "OCR"}
                </Badge>
                <Badge variant="neutral">Extrato Mensal</Badge>
              </div>
            </div>

            <SummaryCards totais={extrato.totaisGerais} />

            <Filters
              filters={filters}
              onChange={setFilters}
              empresasDisponiveis={empresasDisponiveis}
              situacoesDisponiveis={situacoesDisponiveis}
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-text-muted">
                Exibindo <span className="font-medium text-foreground">{filteredColaboradores.length}</span> de{" "}
                {extrato.colaboradores.length} colaboradores.
              </p>
              <ExportButtons result={extrato} />
            </div>

            <EmployeeTable colaboradores={filteredColaboradores} onVerDetalhes={setSelectedId} />
          </>
        )}

        {sintetico && sintetico.linhas.length > 0 && (
          <>
            <div className="card p-4 flex items-center gap-2.5 bg-warning-soft border-0">
              <AlertCircle className="w-4.5 h-4.5 text-warning-strong shrink-0" strokeWidth={1.75} />
              <p className="text-sm text-warning-strong">
                <Badge variant="warning">Experimental</Badge>{" "}
                O suporte a &quot;Relatório Sintético&quot; ainda não foi validado contra um PDF real deste layout. Revise os
                valores com atenção antes de usar para folha oficial.
              </p>
            </div>

            {sintetico.avisos.length > 1 && (
              <details className="card p-4 text-sm text-warning-strong bg-warning-soft border-0">
                <summary className="cursor-pointer font-medium">
                  {sintetico.avisos.length} aviso(s) de leitura — revisar antes de exportar
                </summary>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {sintetico.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.75} />
                <span className="font-medium text-foreground truncate">{sintetico.empresa.nome}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <Badge variant="neutral">Depto {sintetico.empresa.departamento}</Badge>
                <Badge variant="neutral">
                  {sintetico.empresa.periodoInicio} a {sintetico.empresa.periodoFim}
                </Badge>
                <Badge variant="neutral">Relatório Sintético</Badge>
              </div>
            </div>

            <SinteticoSummaryCards totais={sintetico.totais} />

            <div className="card p-4">
              <label className="flex flex-col gap-1 text-sm w-full sm:w-72">
                <span className="field-label">Buscar colaborador</span>
                <input
                  type="text"
                  value={sinteticoBusca}
                  onChange={(e) => setSinteticoBusca(e.target.value)}
                  placeholder="Nome ou matrícula"
                  className="field-input w-full"
                />
              </label>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-text-muted">
                Exibindo <span className="font-medium text-foreground">{filteredLinhas.length}</span> de{" "}
                {sintetico.linhas.length} colaboradores.
              </p>
              <ExportButtons result={sintetico} />
            </div>

            <SinteticoTable linhas={filteredLinhas} />
          </>
        )}
      </main>

      {selectedColaborador && (
        <EmployeeDetailModal
          colaborador={selectedColaborador}
          onClose={() => setSelectedId(null)}
          onSave={handleSaveColaborador}
        />
      )}

      {duplicateExisting && (
        <DuplicateUploadModal
          existing={duplicateExisting}
          onReplace={() => handleDuplicateDecision("replace")}
          onKeepBoth={() => handleDuplicateDecision("keep_both")}
          onCancel={() => handleDuplicateDecision("cancel")}
        />
      )}
    </div>
  );
}
