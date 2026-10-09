"use client";

// Home (Visão geral) — Fase 7L-A. Só dados que os endpoints EXISTENTES já fornecem corretamente; nenhum endpoint novo.
// Orquestração aqui; os blocos são apresentação:
//   - Obrigações recentes: GET /api/financial-records?pageSize=5 — só com financial-records.read.
//   - Última extração da folha: GET /api/uploads (1º item) — só com accounting.read.
//   - Ações rápidas: moduleRegistry + permissões, sem API.
// Sem permissão para um bloco: a chamada NÃO é feita e o bloco não aparece (sem mensagem de erro).
// KPIs: NÃO implementados — os endpoints atuais não agregam, e os estados do FinancialRecord são independentes (não
// sustentam uma métrica de "pendência"). Evolução futura opcional: GET /api/dashboard/summary (7L-B).
import { useEffect, useState } from "react";
import { EmptyState, FeedbackAlert, PageHeader, SkeletonCard, SkeletonGroup } from "@/components/ui";
import type { UploadSummary } from "@/modules/accounting/payroll/ui/PayrollRecentUploads";
import { DashboardPayrollLatest } from "./DashboardPayrollLatest";
import { DashboardQuickActions, quickActionsFor } from "./DashboardQuickActions";
import { DashboardRecentRecords, type RecentFinancialRecord } from "./DashboardRecentRecords";

type Me = { name: string | null; email: string; permissions: string[] };
type Block<T> = { loading: boolean; error: string | null; data: T };

export const HOME_PERMISSIONS = { records: "financial-records.read", payroll: "accounting.read" } as const;

/** Quais blocos de dados o usuário pode ver (e, portanto, quais requests a Home faz). */
export function homeBlocksFor(permissions: readonly string[]) {
  return { records: permissions.includes(HOME_PERMISSIONS.records), payroll: permissions.includes(HOME_PERMISSIONS.payroll) };
}

const firstName = (me: Me) => (me.name?.trim().split(/\s+/)[0] || me.email.split("@")[0]);

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? fallback);
  return body as T;
}

export function HomeDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [records, setRecords] = useState<Block<RecentFinancialRecord[]>>({ loading: true, error: null, data: [] });
  const [payroll, setPayroll] = useState<Block<UploadSummary | null>>({ loading: true, error: null, data: null });

  useEffect(() => {
    getJson<Me>("/api/auth/me", "Não foi possível carregar o seu perfil.")
      .then((value) => {
        setMe(value);
        const blocks = homeBlocksFor(value.permissions ?? []);
        if (blocks.records) {
          getJson<{ items: RecentFinancialRecord[] }>("/api/financial-records?pageSize=5", "Não foi possível carregar as obrigações recentes.")
            .then((body) => setRecords({ loading: false, error: null, data: body.items ?? [] }))
            .catch((cause) => setRecords({ loading: false, error: cause instanceof Error ? cause.message : "Não foi possível carregar as obrigações recentes.", data: [] }));
        }
        if (blocks.payroll) {
          getJson<{ uploads: UploadSummary[] }>("/api/uploads", "Não foi possível carregar a última extração da folha.")
            .then((body) => setPayroll({ loading: false, error: null, data: body.uploads?.[0] ?? null }))
            .catch((cause) => setPayroll({ loading: false, error: cause instanceof Error ? cause.message : "Não foi possível carregar a última extração da folha.", data: null }));
        }
      })
      .catch((cause) => setMeError(cause instanceof Error ? cause.message : "Não foi possível carregar o seu perfil."));
  }, []);

  const permissions = me?.permissions ?? [];
  const blocks = homeBlocksFor(permissions);
  const hasActions = quickActionsFor(permissions).length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
        <PageHeader title="Visão geral" description={me ? `Olá, ${firstName(me)}. Obrigações recentes, última extração da folha e atalhos para o seu trabalho.` : "Obrigações recentes, última extração da folha e atalhos para o seu trabalho."} />
        {meError && <FeedbackAlert status="error">{meError}</FeedbackAlert>}
        {!me && !meError && <SkeletonGroup label="Carregando a visão geral"><div className="grid gap-4 lg:grid-cols-3"><SkeletonCard className="lg:col-span-2" lines={5} /><SkeletonCard lines={4} /></div></SkeletonGroup>}
        {me && (
          <>
            <DashboardQuickActions permissions={permissions} />
            {(blocks.records || blocks.payroll) ? (
              <div className="grid min-w-0 gap-5 lg:grid-cols-3">
                {blocks.records && <div className={blocks.payroll ? "min-w-0 lg:col-span-2" : "min-w-0 lg:col-span-3"}><DashboardRecentRecords rows={records.data} loading={records.loading} error={records.error} /></div>}
                {blocks.payroll && <div className={blocks.records ? "min-w-0" : "min-w-0 lg:col-span-3"}><DashboardPayrollLatest upload={payroll.data} loading={payroll.loading} error={payroll.error} /></div>}
              </div>
            ) : (
              <EmptyState
                title="Nenhum painel de dados disponível para o seu perfil"
                description={hasActions ? "Use as ações rápidas acima ou o menu lateral para acessar os módulos permitidos." : "Solicite ao administrador acesso aos módulos de que você precisa."}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
