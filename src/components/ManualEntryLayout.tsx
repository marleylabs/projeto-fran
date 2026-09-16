import type { ReactNode } from "react";
import type { CollaboratorOption } from "./CollaboratorCombobox";

export function ManualEntrySection({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return <section className="rounded-xl bg-base-200/70 p-4 sm:p-5"><div className="mb-4">{eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}<h3 className="font-bold text-neutral">{title}</h3></div>{children}</section>;
}

export function CollaboratorSummaryCard({ collaborator }: { collaborator: CollaboratorOption }) {
  return <article className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h4 className="font-bold text-neutral sm:text-lg">{collaborator.officialName}</h4><p className="text-sm text-secondary">{collaborator.jobTitle || "Função não informada"}</p></div><span className="badge badge-success badge-sm">Ativo</span></div><dl className="mt-4 grid gap-3 border-t border-base-300 pt-4 sm:grid-cols-2"><div><dt className="text-xs font-medium text-secondary">Departamento</dt><dd className="mt-1 font-semibold text-neutral">{collaborator.department}</dd></div><div><dt className="text-xs font-medium text-secondary">Centro de Custo</dt><dd className="mt-1 font-semibold text-neutral">{collaborator.costCenter || "Não informado"}</dd></div></dl><p className="mt-4 text-xs text-secondary">Para corrigir estes dados, utilize Cadastros → Colaboradores.</p></article>;
}
