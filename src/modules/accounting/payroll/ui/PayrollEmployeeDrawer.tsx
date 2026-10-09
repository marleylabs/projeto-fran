"use client";

// Painel lateral de um colaborador da extração: Detalhes, Rubricas, Texto bruto e Revisar/corrigir.
// A correção é LOCAL (como antes): onSave devolve o colaborador ao PayrollWorkspace, que atualiza a extração em tela e
// recalcula os totais com computeTotaisGerais. Nada é gravado no servidor por aqui.
import { useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button, CurrencyInput, DataTable, Drawer, FeedbackAlert, Field, StatusBadge, TabPanel, Tabs, TextInput, type DataTableColumn, type StatusTone } from "@/components/ui";
import type { Colaborador, Rubrica } from "@/lib/types/payroll";
import { brl, situacaoTone } from "./format";
import { LowConfidence } from "./PayrollTables";

type Tab = "detalhes" | "rubricas" | "texto" | "editar";

const RUBRICA_TONE: Record<Rubrica["tipo"], StatusTone> = { Provento: "success", Desconto: "danger", Informativa: "info", "Informativa Dedutora": "neutral" };

function Facts({ items, columns = "sm:grid-cols-3" }: { items: [string, ReactNode][]; columns?: string }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 ${columns}`}>
      {items.map(([label, value]) => <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5"><dt className="text-caption text-foreground-muted">{label}</dt><dd className="break-words text-body font-medium tabular-nums">{value || "—"}</dd></div>)}
    </dl>
  );
}

const rubricaColumns: DataTableColumn<Rubrica & { index: number }>[] = [
  { id: "codigo", header: "Código", cell: (r) => <span className="tabular-nums">{r.codigo || "—"}</span> },
  { id: "descricao", header: "Descrição", rowHeader: true, wrap: true, cell: (r) => <span className="flex flex-wrap items-center gap-1.5">{r.descricao}{r.confianca === "baixa" && <LowConfidence generic />}</span> },
  { id: "tipo", header: "Tipo", cell: (r) => <StatusBadge tone={RUBRICA_TONE[r.tipo]}>{r.tipo}</StatusBadge> },
  { id: "referencia", header: "Referência", cell: (r) => r.referencia ?? "—" },
  { id: "valor", header: "Valor", numeric: true, cell: (r) => brl(r.valor) },
];

type FormValues = {
  nome: string; cpf: string; situacao: string; vinculo: string; cargo: string; departamento: string; centroCusto: string;
  salario: number; proventos: number; descontos: number; liquido: number;
};

function EditForm({ colaborador, onSave, onCancel }: { colaborador: Colaborador; onSave: (updated: Colaborador) => void; onCancel: () => void }) {
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      nome: colaborador.nome, cpf: colaborador.cpf, situacao: colaborador.situacao, vinculo: colaborador.vinculo, cargo: colaborador.cargo,
      departamento: colaborador.departamento, centroCusto: colaborador.centroCusto,
      salario: colaborador.salario, proventos: colaborador.proventos, descontos: colaborador.descontos, liquido: colaborador.liquido,
    },
  });
  const onSubmit = (values: FormValues) => {
    onSave({
      ...colaborador,
      ...values,
      salario: Number(values.salario),
      proventos: Number(values.proventos),
      descontos: Number(values.descontos),
      liquido: Number(values.liquido),
      revisadoManualmente: true,
    });
  };
  const text = (name: Exclude<keyof FormValues, "salario" | "proventos" | "descontos" | "liquido" | "nome" | "cpf">, label: string) => (
    <Field label={label}>{(controlProps) => <TextInput {...controlProps} {...register(name)} />}</Field>
  );
  const money = (name: "salario" | "proventos" | "descontos" | "liquido", label: string) => (
    <Field label={`${label} (R$)`}>{(controlProps) => <Controller control={control} name={name} render={({ field }) => <CurrencyInput {...controlProps} value={Number.isFinite(field.value) ? field.value : null} onValueChange={(value) => field.onChange(value)} onBlur={field.onBlur} ref={field.ref} />} />}</Field>
  );
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <FeedbackAlert status="info">A correção vale para esta extração em tela e para as exportações; os totais são recalculados.</FeedbackAlert>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-label text-foreground-muted">Identificação</legend>
        <Field label="Nome" required error={errors.nome ? "Informe o nome." : undefined}>{(controlProps) => <TextInput {...controlProps} {...register("nome", { required: true })} />}</Field>
        <Field label="CPF" error={errors.cpf ? "Use o formato 000.000.000-00." : undefined}>{(controlProps) => <TextInput {...controlProps} className="tabular-nums" placeholder="000.000.000-00" {...register("cpf", { pattern: /\d{3}\.\d{3}\.\d{3}-\d{2}/ })} />}</Field>
        {text("situacao", "Situação")}
        {text("vinculo", "Vínculo")}
        {text("cargo", "Cargo")}
        {text("departamento", "Departamento")}
        {text("centroCusto", "Centro de custo")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-label text-foreground-muted">Valores</legend>
        {money("salario", "Salário")}
        {money("proventos", "Proventos")}
        {money("descontos", "Descontos")}
        {money("liquido", "Líquido")}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" aura>Salvar correção</Button>
      </div>
    </form>
  );
}

export function PayrollEmployeeDrawer({ colaborador, onClose, onSave }: { colaborador: Colaborador | null; onClose: () => void; onSave: (updated: Colaborador) => void }) {
  const [tab, setTab] = useState<Tab>("detalhes");
  const [shownId, setShownId] = useState<string | null>(null);
  // Ao abrir outro colaborador, volta para Detalhes.
  if (colaborador && colaborador.id !== shownId) { setShownId(colaborador.id); setTab("detalhes"); }
  const c = colaborador;
  return (
    <Drawer open={Boolean(c)} onClose={onClose} side="right" title={c?.nome || "Colaborador sem nome identificado"} closeLabel="Fechar detalhes" className="w-[min(46rem,100vw)]">
      {c && <div className="grid gap-4 px-4 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-body text-foreground-muted">
          <span>Matrícula {c.codigo || "—"} · {c.cargo || "—"}</span>
          <StatusBadge tone={situacaoTone(c.situacao)}>{c.situacao || "—"}</StatusBadge>
          {c.revisadoManualmente && <StatusBadge tone="info">Revisado</StatusBadge>}
        </div>
        <Tabs label="Informações do colaborador" items={[{ value: "detalhes", label: "Detalhes" }, { value: "rubricas", label: `Rubricas (${c.rubricas.length})` }, { value: "texto", label: "Texto bruto" }, { value: "editar", label: "Revisar / corrigir" }]} value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabPanel value="detalhes" className="mt-4 grid gap-5">
            {c.camposBaixaConfianca.length > 0 && <FeedbackAlert status="warning" title="Baixa confiança de leitura">Campos: {c.camposBaixaConfianca.join(", ")}. Revise em &quot;Revisar / corrigir&quot;.</FeedbackAlert>}
            <Facts items={[
              ["Empresa", c.empresaNome || ""], ["Código", c.codigo], ["CPF", c.cpf], ["Admissão", c.admissao], ["Vínculo", c.vinculo], ["Horas mês", c.horasMes],
              ["Departamento", c.departamento], ["Centro de custo", c.centroCusto], ["Filial", c.filial], ["Cargo", `${c.cargoCodigo} - ${c.cargo}`], ["CBO", c.cbo], ["Salário", brl(c.salario)],
            ]} />
            <div className="border-t border-border pt-4">
              <Facts columns="sm:grid-cols-4" items={[
                ["Proventos", brl(c.proventos)], ["Descontos", brl(c.descontos)], ["Líquido", brl(c.liquido)], ["Informativa", brl(c.informativa)], ["Informativa dedutora", brl(c.informativaDedutora)],
                ["Base INSS", brl(c.baseINSS)], ["Base FGTS", brl(c.baseFGTS)], ["Base IRRF", brl(c.baseIRRF)], ["Excedente INSS", brl(c.excedenteINSS)], ["Valor FGTS", brl(c.valorFGTS)],
              ]} />
            </div>
            {c.observacoes.length > 0 && (
              <section aria-labelledby="payroll-observacoes" className="grid gap-1 border-t border-border pt-4">
                <h3 id="payroll-observacoes" className="text-label text-foreground-muted">Observações</h3>
                <ul className="list-inside list-disc text-body">{c.observacoes.map((o, i) => <li key={i}>{o}</li>)}</ul>
              </section>
            )}
          </TabPanel>
          <TabPanel value="rubricas" className="mt-4">
            <DataTable caption={`Rubricas de ${c.nome || c.codigo}`} columns={rubricaColumns} rows={c.rubricas.map((r, index) => ({ ...r, index }))} getRowId={(r) => String(r.index)} density="dense" minWidth="560px" empty={{ title: "Nenhuma rubrica encontrada para este colaborador" }} />
          </TabPanel>
          <TabPanel value="texto" className="mt-4">
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-control border border-border bg-surface-muted p-3 font-mono text-caption" aria-label="Texto bruto extraído do PDF" tabIndex={0}>{c.textoBruto}</pre>
          </TabPanel>
          <TabPanel value="editar" className="mt-4">
            <EditForm key={c.id} colaborador={c} onCancel={() => setTab("detalhes")} onSave={(updated) => { onSave(updated); setTab("detalhes"); }} />
          </TabPanel>
        </Tabs>
      </div>}
    </Drawer>
  );
}
