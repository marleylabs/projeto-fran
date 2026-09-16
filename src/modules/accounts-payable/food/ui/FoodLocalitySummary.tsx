type FoodLocalitySummaryProps = {
  locality: "MA" | "PA";
  suppliers: number;
  collaborators: number;
  meals: number;
  formattedTotal: string;
};

type FoodInformativeTotalSummaryProps = {
  obligations: number;
  collaborators: number;
  meals: number;
  formattedTotal: string;
};

type MetricIconName =
  | "suppliers"
  | "obligations"
  | "collaborators"
  | "meals"
  | "total";

type SummaryMetric = {
  icon: MetricIconName;
  title: string;
  value: string | number;
  description: string;
  emphasized?: boolean;
};

function MetricIcon({ name }: { name: MetricIconName }) {
  const paths: Record<MetricIconName, React.ReactNode> = {
    suppliers: (
      <>
        <path d="M3 21h18" />
        <path d="M6 21V7l6-4 6 4v14" />
        <path d="M9 10h.01M9 14h.01M15 10h.01M15 14h.01" />
      </>
    ),
    obligations: (
      <>
        <path d="M6 2h9l4 4v16H6z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </>
    ),
    collaborators: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    meals: (
      <>
        <path d="M3 2v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2M6 2v20" />
        <path d="M18 15V2a5 5 0 0 0-5 5v5c0 1.66 1.34 3 3 3h2zm0 0v7" />
      </>
    ),
    total: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const metricClassName =
  "stat min-w-0 border-b px-4 py-5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0";

type FoodSummaryStatsProps = {
  id: string;
  badge: string;
  title: string;
  description: string;
  metrics: [SummaryMetric, SummaryMetric, SummaryMetric, SummaryMetric];
  tone?: "light" | "dark";
};

function FoodSummaryStats({
  badge,
  description,
  id,
  metrics,
  title,
  tone = "light",
}: FoodSummaryStatsProps) {
  const dark = tone === "dark";

  return (
    <article
      aria-labelledby={id}
      className={`min-w-0 ${
        dark ? "rounded-xl bg-neutral p-4 shadow-lg sm:p-5" : ""
      }`}
    >
      <header className="mb-3 flex items-center gap-3">
        <span className="badge badge-primary badge-lg font-bold">{badge}</span>
        <div>
          <h3
            id={id}
            className={`font-bold ${dark ? "text-neutral-content" : "text-neutral"}`}
          >
            {title}
          </h3>
          <p
            className={`text-xs ${dark ? "text-slate-300" : "text-secondary"}`}
          >
            {description}
          </p>
        </div>
      </header>

      <div
        className={`stats grid w-full grid-cols-1 overflow-hidden border shadow-sm sm:grid-cols-2 xl:grid-cols-4 [grid-auto-flow:row] ${
          dark
            ? "border-white/20 bg-white/5"
            : "border-base-300 bg-base-100"
        }`}
      >
        {metrics.map((metric) => (
          <div
            key={metric.title}
            className={`${metricClassName} ${
              dark ? "border-white/20" : "border-base-300"
            }`}
          >
            <div
              className={`stat-figure ${dark ? "text-primary-soft" : "text-primary"}`}
            >
              <MetricIcon name={metric.icon} />
            </div>
            <div
              className={`stat-title ${dark ? "text-slate-300" : "text-secondary"}`}
            >
              {metric.title}
            </div>
            <div
              className={`stat-value break-words ${
                metric.emphasized
                  ? `text-2xl sm:text-3xl xl:text-2xl 2xl:text-3xl ${
                      dark ? "text-primary-soft" : "text-primary"
                    }`
                  : `text-3xl ${
                      dark ? "text-neutral-content" : "text-neutral"
                    }`
              }`}
            >
              {metric.value}
            </div>
            <div
              className={`stat-desc ${dark ? "text-slate-300" : "text-secondary"}`}
            >
              {metric.description}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function FoodLocalitySummary({
  collaborators,
  formattedTotal,
  locality,
  meals,
  suppliers,
}: FoodLocalitySummaryProps) {
  const stateName = locality === "MA" ? "Maranhão" : "Pará";
  const hasData = suppliers > 0;

  return (
    <FoodSummaryStats
      id={`summary-${locality}`}
      badge={locality}
      title={stateName}
      description={
        hasData
          ? "Resumo da competência selecionada"
          : "Nenhum processamento nesta competência"
      }
      metrics={[
        {
          icon: "suppliers",
          title: "Fornecedores",
          value: suppliers,
          description: "Processado(s)",
        },
        {
          icon: "collaborators",
          title: "Colaboradores",
          value: collaborators,
          description: "Colaboradores únicos",
        },
        {
          icon: "meals",
          title: "Refeições",
          value: meals,
          description: "Ocorrências válidas",
        },
        {
          icon: "total",
          title: "Valor total",
          value: formattedTotal,
          description: "Competência atual",
          emphasized: true,
        },
      ]}
    />
  );
}

export function FoodInformativeTotalSummary({
  collaborators,
  formattedTotal,
  meals,
  obligations,
}: FoodInformativeTotalSummaryProps) {
  return (
    <FoodSummaryStats
      id="summary-total"
      badge="MA + PA"
      title="TOTAL INFORMATIVO"
      description="Consolidado da competência"
      tone="dark"
      metrics={[
        {
          icon: "obligations",
          title: "Obrigações",
          value: obligations,
          description: "Obrigações geradas",
        },
        {
          icon: "collaborators",
          title: "Colaboradores",
          value: collaborators,
          description: "Colaboradores únicos",
        },
        {
          icon: "meals",
          title: "Refeições",
          value: meals,
          description: "Ocorrências válidas",
        },
        {
          icon: "total",
          title: "Valor total",
          value: formattedTotal,
          description: "MA + PA",
          emphasized: true,
        },
      ]}
    />
  );
}
