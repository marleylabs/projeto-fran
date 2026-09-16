"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Colaborador } from "@/lib/types/payroll";
import type { PayrollExtractionResult } from "@/lib/parser/router";
import { computeTotaisGerais } from "@/lib/parser/computeTotals";
import { uploadPdf, type DuplicateExisting } from "@/lib/uploadWithProgress";
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
import { CorporateHeader } from "@/components/CorporateHeader";
import { PageHeader } from "@/components/ui";

type Stage = "idle" | "uploading" | "processing" | "error";

const LAST_UPLOAD_KEY = "extratoMensal:currentUploadId";

export function PayrollWorkspace() {
  const router = useRouter();
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PayrollExtractionResult | null>(null);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [sinteticoBusca, setSinteticoBusca] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => setCurrentUserEmail(me.email))
      .catch(() => setCurrentUserEmail(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const runUpload = async (file: File, duplicateAction?: "replace" | "keep_both") => {
    setStage("uploading");
    setErrorMessage(null);
    setResult(null);
    setProgress(0);
    setFileName(file.name);

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

  return (
    <div className="flex-1 flex flex-col">
      <CorporateHeader
        currentUserEmail={currentUserEmail}
        showNewUpload={!!result}
        onNewUpload={reset}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <PageHeader eyebrow="Contabilidade / Importações de folha" title="Extrato mensal" description="Extração, conferência e consolidação de relatórios de folha de pagamento."/>
        {restoring && (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-text-muted">Carregando...</div>
        )}

        {!restoring && !result && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-16">
            <FileUpload
              onFileSelected={handleFileSelected}
              disabled={stage === "uploading" || stage === "processing"}
              loading={stage === "uploading" || stage === "processing"}
              fileName={fileName}
              error={stage === "error"}
            />

            {(stage === "uploading" || stage === "processing") && (
              <ProgressBar
                percent={progress}
                label={stage === "uploading" ? `Enviando ${fileName}...` : "Lendo PDF e extraindo colaboradores..."}
              />
            )}

            {stage === "error" && errorMessage && (
              <div className="max-w-md rounded-md border border-error/30 bg-error/5 text-error text-sm px-4 py-3">
                {errorMessage}
              </div>
            )}

            <RecentUploads uploads={recentUploads} onSelect={handleSelectRecent} />
          </div>
        )}

        {extrato && extrato.colaboradores.length > 0 && (
          <>
            {extrato.avisos.length > 0 && (
              <details className="card p-4 text-sm text-warning bg-warning-soft border border-warning/30">
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

            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>
                {extrato.consolidado
                  ? `${extrato.empresa.nome} · Competência ${extrato.empresa.competencia} · ${empresasDisponiveis.length} empresa(s) · Leitura por ${
                      extrato.metodoLeitura === "texto" ? "texto" : "OCR"
                    } · Formato: Extrato Mensal`
                  : `${extrato.empresa.nome} · CNPJ ${extrato.empresa.cnpj} · Competência ${extrato.empresa.competencia} · Leitura por ${
                      extrato.metodoLeitura === "texto" ? "texto" : "OCR"
                    } · Formato: Extrato Mensal`}
              </span>
            </div>

            <SummaryCards totais={extrato.totaisGerais} />

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <Filters
                filters={filters}
                onChange={setFilters}
                empresasDisponiveis={empresasDisponiveis}
                situacoesDisponiveis={situacoesDisponiveis}
              />
              <ExportButtons result={extrato} />
            </div>

            <p className="text-sm text-text-muted">
              Exibindo {filteredColaboradores.length} de {extrato.colaboradores.length} colaboradores.
            </p>

            <EmployeeTable colaboradores={filteredColaboradores} onVerDetalhes={setSelectedId} />
          </>
        )}

        {sintetico && sintetico.linhas.length > 0 && (
          <>
            <div className="card p-4 text-sm text-warning bg-warning-soft border border-warning/30">
              Formato experimental: o suporte a &quot;Relatório Sintético&quot; ainda não foi validado contra um PDF real deste
              layout. Revise os valores com atenção antes de usar para folha oficial.
            </div>

            {sintetico.avisos.length > 1 && (
              <details className="card p-4 text-sm text-warning bg-warning-soft border border-warning/30">
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

            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>
                {sintetico.empresa.nome} · Departamento {sintetico.empresa.departamento} · Período{" "}
                {sintetico.empresa.periodoInicio} a {sintetico.empresa.periodoFim} · Formato: Relatório Sintético
              </span>
            </div>

            <SinteticoSummaryCards totais={sintetico.totais} />

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="card p-4 flex items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-text-muted">Nome ou matrícula</span>
                  <input
                    type="text"
                    value={sinteticoBusca}
                    onChange={(e) => setSinteticoBusca(e.target.value)}
                    placeholder="Buscar colaborador"
                    className="input input-bordered input-sm"
                  />
                </label>
              </div>
              <ExportButtons result={sintetico} />
            </div>

            <p className="text-sm text-text-muted">
              Exibindo {filteredLinhas.length} de {sintetico.linhas.length} colaboradores.
            </p>

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
