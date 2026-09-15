"use client";

import { useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import type { Colaborador } from "@/lib/types/payroll";
import { formatBRNumber } from "@/lib/normalize/money";
import { StatusBadge } from "./StatusBadge";
import { Badge } from "./ui/Badge";
import { RubricasTable } from "./RubricasTable";
import { EditColaboradorForm } from "./EditColaboradorForm";

type Tab = "detalhes" | "rubricas" | "texto" | "editar";

interface Props {
  colaborador: Colaborador;
  onClose: () => void;
  onSave: (updated: Colaborador) => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  );
}

export function EmployeeDetailModal({ colaborador, onClose, onSave }: Props) {
  const [tab, setTab] = useState<Tab>("detalhes");

  const tabs: { id: Tab; label: string }[] = [
    { id: "detalhes", label: "Detalhes" },
    { id: "rubricas", label: `Rubricas (${colaborador.rubricas.length})` },
    { id: "texto", label: "Texto bruto" },
    { id: "editar", label: "Revisar / corrigir" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-2 sm:p-6 overflow-y-auto">
      <div className="card w-full max-w-3xl my-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 truncate">
              {colaborador.nome || "Colaborador sem nome identificado"}
              {colaborador.revisadoManualmente && <Badge variant="info">revisado</Badge>}
            </h2>
            <p className="text-sm text-text-muted">
              Matrícula {colaborador.codigo || "—"} · {colaborador.cargo || "—"}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm !p-1.5 shrink-0" aria-label="Fechar">
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-border overflow-x-auto scrollbar-thin">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {tab === "detalhes" && (
            <div className="space-y-5">
              {colaborador.camposBaixaConfianca.length > 0 && (
                <div className="rounded-lg bg-warning-soft text-warning-strong text-sm px-3 py-2">
                  Campos com baixa confiança de leitura: {colaborador.camposBaixaConfianca.join(", ")}. Revise em
                  &quot;Revisar / corrigir&quot;.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Empresa" value={colaborador.empresaNome || ""} />
                <Field label="Código" value={colaborador.codigo} />
                <Field label="CPF" value={colaborador.cpf} />
                <Field label="Admissão" value={colaborador.admissao} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Situação</span>
                  <StatusBadge situacao={colaborador.situacao} />
                </div>
                <Field label="Vínculo" value={colaborador.vinculo} />
                <Field label="Horas Mês" value={colaborador.horasMes} />
                <Field label="Departamento" value={colaborador.departamento} />
                <Field label="Centro de Custo" value={colaborador.centroCusto} />
                <Field label="Filial" value={colaborador.filial} />
                <Field label="Cargo" value={`${colaborador.cargoCodigo} - ${colaborador.cargo}`} />
                <Field label="CBO" value={colaborador.cbo} />
                <Field label="Salário" value={`R$ ${formatBRNumber(colaborador.salario)}`} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
                <Field label="Proventos" value={`R$ ${formatBRNumber(colaborador.proventos)}`} />
                <Field label="Descontos" value={`R$ ${formatBRNumber(colaborador.descontos)}`} />
                <Field label="Líquido" value={`R$ ${formatBRNumber(colaborador.liquido)}`} />
                <Field label="Informativa" value={`R$ ${formatBRNumber(colaborador.informativa)}`} />
                <Field label="Informativa Dedutora" value={`R$ ${formatBRNumber(colaborador.informativaDedutora)}`} />
                <Field label="Base INSS" value={`R$ ${formatBRNumber(colaborador.baseINSS)}`} />
                <Field label="Base FGTS" value={`R$ ${formatBRNumber(colaborador.baseFGTS)}`} />
                <Field label="Base IRRF" value={`R$ ${formatBRNumber(colaborador.baseIRRF)}`} />
                <Field label="Excedente INSS" value={`R$ ${formatBRNumber(colaborador.excedenteINSS)}`} />
                <Field label="Valor FGTS" value={`R$ ${formatBRNumber(colaborador.valorFGTS)}`} />
              </div>

              {colaborador.observacoes.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Observações</span>
                  <ul className="list-disc list-inside text-sm text-foreground mt-1">
                    {colaborador.observacoes.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "rubricas" && <RubricasTable rubricas={colaborador.rubricas} />}

          {tab === "texto" && (
            <pre className="text-xs bg-surface-soft border border-border rounded-md p-3 whitespace-pre-wrap font-mono text-text">
              {colaborador.textoBruto}
            </pre>
          )}

          {tab === "editar" && (
            <EditColaboradorForm
              colaborador={colaborador}
              onCancel={() => setTab("detalhes")}
              onSave={(updated) => {
                onSave(updated);
                setTab("detalhes");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
