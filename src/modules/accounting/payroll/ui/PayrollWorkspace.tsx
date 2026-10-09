"use client";

// Contabilidade → Folha (Extrato Mensal / Relatório Sintético). Fase 7K: workspace no Design System. Este componente
// continua sendo a ORQUESTRAÇÃO (envio do PDF para /api/extract com progresso e duplicidade, restauração da última
// extração, uploads recentes, filtros, correção local com recálculo dos totais por computeTotaisGerais, reset); a
// apresentação foi extraída para ./Payroll* e recebe só dados e callbacks. Parser, OCR, API e exportações inalterados.
import { useEffect, useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import type { Colaborador } from "@/lib/types/payroll";
import type { PayrollExtractionResult } from "@/lib/parser/router";
import { computeTotaisGerais } from "@/lib/parser/computeTotals";
import { uploadPdf, type DuplicateExisting } from "@/lib/uploadWithProgress";
import { Button, FeedbackAlert, FilterBar, PageHeader, SearchInput, SkeletonCard, SkeletonGroup, type UploadFileLike } from "@/components/ui";
import { PayrollUploadPanel, type PayrollUploadStage } from "./PayrollUploadPanel";
import { PayrollRecentUploads, type UploadSummary } from "./PayrollRecentUploads";
import { ExtratoTotals, PayrollContext, ReadingNotices, SinteticoTotals } from "./PayrollSummary";
import { PayrollFilters, EMPTY_FILTERS, type FiltersState } from "./PayrollFilters";
import { PayrollEmployeeTable, PayrollSinteticoTable } from "./PayrollTables";
import { PayrollEmployeeDrawer } from "./PayrollEmployeeDrawer";
import { PayrollExportActions } from "./PayrollExportActions";
import { PayrollDuplicateDialog } from "./PayrollDuplicateDialog";
import { leituraLabel } from "./format";

type Stage = PayrollUploadStage;

const LAST_UPLOAD_KEY = "extratoMensal:currentUploadId";

export function PayrollWorkspace() {
  const [stage, setStage] = useState<Stage>("idle");
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
  // Só apresentação: arquivo exibido no UploadDropzone (nome/tamanho) e percentual REAL do envio. A leitura/extração no
  // servidor não informa progresso: a tela mostra a etapa sem porcentagem (o antigo percentual simulado foi removido).
  const [uploadFile, setUploadFile] = useState<UploadFileLike | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);

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
    setFileName(file.name);
    setUploadFile({ name: file.name, size: file.size, type: file.type });
    setUploadPercent(0);

    try {
      const outcome = await uploadPdf(
        file,
        (uploadPercent) => {
          setUploadPercent(uploadPercent);
          if (uploadPercent >= 100) setStage("processing");
        },
        duplicateAction
      );

      if (outcome.status === "duplicate") {
        setPendingFile(file);
        setDuplicateExisting(outcome.existing);
        setStage("idle");
        return;
      }

      const data = outcome.data;
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
    setFilters(EMPTY_FILTERS);
    setSinteticoBusca("");
    localStorage.removeItem(LAST_UPLOAD_KEY);
    loadRecentUploads();
    setUploadFile(null);
    setUploadPercent(0);
  };

  const busy = stage === "uploading" || stage === "processing";

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
        <PageHeader
          eyebrow="Contabilidade"
          title="Extrato mensal"
          description="Extração, conferência e consolidação de relatórios de folha de pagamento."
          actions={result ? <Button variant="secondary" onClick={reset}><FilePlus2 size={16} aria-hidden="true" />Novo upload</Button> : undefined}
        />

        {restoring && <SkeletonGroup label="Carregando a última extração"><SkeletonCard lines={4} /></SkeletonGroup>}

        {!restoring && !result && (
          <div className="grid gap-5">
            <PayrollUploadPanel stage={stage} file={uploadFile ?? (fileName ? { name: fileName, size: 0 } : null)} uploadPercent={uploadPercent} errorMessage={errorMessage} onFileSelect={handleFileSelected} />
            {!busy && <PayrollRecentUploads uploads={recentUploads} onSelect={handleSelectRecent} />}
          </div>
        )}

        {/* Extração vazia (formato desconhecido ou sem colaboradores): erro visível, não só toast. */}
        {!restoring && result && stage === "error" && <FeedbackAlert status="error" title="Não foi possível extrair a folha">{errorMessage ?? "Nenhum colaborador foi identificado neste PDF. Verifique o arquivo e envie novamente."}</FeedbackAlert>}

        {extrato && extrato.colaboradores.length > 0 && (
          <>
            <PayrollContext
              format="Extrato Mensal"
              items={[
                ["Empresa", extrato.empresa.nome],
                ...(extrato.consolidado ? [["Empresas", String(empresasDisponiveis.length)] as [string, string]] : [["CNPJ", extrato.empresa.cnpj] as [string, string]]),
                ["Competência", extrato.empresa.competencia],
                ["Leitura", leituraLabel(extrato.metodoLeitura)],
              ]}
            />
            <ReadingNotices avisos={extrato.avisos} />
            <ExtratoTotals totais={extrato.totaisGerais} />
            <PayrollFilters
              filters={filters}
              onChange={setFilters}
              empresasDisponiveis={empresasDisponiveis}
              situacoesDisponiveis={situacoesDisponiveis}
              actions={<PayrollExportActions result={extrato} />}
            />
            <p className="text-body text-foreground-muted tabular-nums" role="status">Exibindo {filteredColaboradores.length} de {extrato.colaboradores.length} colaboradores.</p>
            <PayrollEmployeeTable colaboradores={filteredColaboradores} onVerDetalhes={setSelectedId} />
          </>
        )}

        {sintetico && sintetico.linhas.length > 0 && (
          <>
            <PayrollContext
              format="Relatório Sintético"
              items={[
                ["Empresa", sintetico.empresa.nome],
                ["Departamento", sintetico.empresa.departamento],
                ["Período", `${sintetico.empresa.periodoInicio} a ${sintetico.empresa.periodoFim}`],
              ]}
            />
            <FeedbackAlert status="warning" title="Formato experimental">
              O suporte a &quot;Relatório Sintético&quot; ainda não foi validado contra um PDF real deste layout. Revise os valores com atenção antes de usar para folha oficial.
            </FeedbackAlert>
            {sintetico.avisos.length > 1 && <ReadingNotices avisos={sintetico.avisos} />}
            <SinteticoTotals totais={sintetico.totais} />
            <FilterBar
              label="Busca no Relatório Sintético"
              search={<SearchInput label="Nome ou matrícula" placeholder="Buscar por nome ou matrícula" value={sinteticoBusca} onValueChange={setSinteticoBusca} />}
              activeCount={sinteticoBusca.trim() ? 1 : 0}
              onClear={() => setSinteticoBusca("")}
              actions={<PayrollExportActions result={sintetico} />}
            />
            <p className="text-body text-foreground-muted tabular-nums" role="status">Exibindo {filteredLinhas.length} de {sintetico.linhas.length} colaboradores.</p>
            <PayrollSinteticoTable linhas={filteredLinhas} />
          </>
        )}
      </main>

      <PayrollEmployeeDrawer colaborador={selectedColaborador} onClose={() => setSelectedId(null)} onSave={handleSaveColaborador} />

      <PayrollDuplicateDialog
        existing={duplicateExisting}
        onReplace={() => handleDuplicateDecision("replace")}
        onKeepBoth={() => handleDuplicateDecision("keep_both")}
        onCancel={() => handleDuplicateDecision("cancel")}
      />
    </div>
  );
}
