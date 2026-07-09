"use client";

import { useForm } from "react-hook-form";
import type { Colaborador } from "@/lib/types/payroll";

type FormValues = {
  nome: string;
  cpf: string;
  situacao: string;
  vinculo: string;
  cargo: string;
  departamento: string;
  centroCusto: string;
  salario: number;
  proventos: number;
  descontos: number;
  liquido: number;
};

interface Props {
  colaborador: Colaborador;
  onSave: (updated: Colaborador) => void;
  onCancel: () => void;
}

function inputClass(hasError: boolean) {
  return `rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
    hasError ? "border-red-400" : "border-border focus:border-primary"
  }`;
}

export function EditColaboradorForm({ colaborador, onSave, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      nome: colaborador.nome,
      cpf: colaborador.cpf,
      situacao: colaborador.situacao,
      vinculo: colaborador.vinculo,
      cargo: colaborador.cargo,
      departamento: colaborador.departamento,
      centroCusto: colaborador.centroCusto,
      salario: colaborador.salario,
      proventos: colaborador.proventos,
      descontos: colaborador.descontos,
      liquido: colaborador.liquido,
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Nome</span>
        <input className={inputClass(!!errors.nome)} {...register("nome", { required: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">CPF</span>
        <input
          className={inputClass(!!errors.cpf)}
          {...register("cpf", { pattern: /\d{3}\.\d{3}\.\d{3}-\d{2}/ })}
          placeholder="000.000.000-00"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Situação</span>
        <input className={inputClass(false)} {...register("situacao")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Vínculo</span>
        <input className={inputClass(false)} {...register("vinculo")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Cargo</span>
        <input className={inputClass(false)} {...register("cargo")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Departamento</span>
        <input className={inputClass(false)} {...register("departamento")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Centro de custo</span>
        <input className={inputClass(false)} {...register("centroCusto")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Salário</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("salario", { valueAsNumber: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Proventos</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("proventos", { valueAsNumber: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Descontos</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("descontos", { valueAsNumber: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-text-muted">Líquido</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("liquido", { valueAsNumber: true })} />
      </label>

      <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-soft">
          Cancelar
        </button>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          Salvar correção
        </button>
      </div>
    </form>
  );
}
