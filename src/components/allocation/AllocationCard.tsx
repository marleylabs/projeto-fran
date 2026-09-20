import type { ReactNode } from "react";

export type AllocationIndicator = { label: string; value: ReactNode };

export function AllocationCard({
  title,
  subtitle,
  badge,
  indicators,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  indicators: AllocationIndicator[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-bold">{title}</h3>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicators.map((indicator) => (
          <div key={indicator.label}>
            <span className="block text-xs text-text-muted">{indicator.label}</span>
            <strong>{indicator.value}</strong>
          </div>
        ))}
      </div>
      {children}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

export function AllocationDepartmentList({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid gap-3">{children}</div>;
}

export function AllocationDepartmentAccordion({
  name,
  summary,
  children,
}: {
  name: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer list-none p-4">
        <strong>{name}</strong>
        <span className="ml-3 text-sm text-text-muted">{summary}</span>
      </summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
  );
}
