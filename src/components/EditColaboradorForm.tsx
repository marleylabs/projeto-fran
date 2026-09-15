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
  return `field-input ${hasError ? "!border-danger" : ""}`;
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
        <span className="field-label">Nome</span>
        <input className={inputClass(!!errors.nome)} {...register("nome", { required: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">CPF</span>
        <input
          className={inputClass(!!errors.cpf)}
          {...register("cpf", { pattern: /\d{3}\.\d{3}\.\d{3}-\d{2}/ })}
          placeholder="000.000.000-00"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Situação</span>
        <input className={inputClass(false)} {...register("situacao")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Vínculo</span>
        <input className={inputClass(false)} {...register("vinculo")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Cargo</span>
        <input className={inputClass(false)} {...register("cargo")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Departamento</span>
        <input className={inputClass(false)} {...register("departamento")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Centro de custo</span>
        <input className={inputClass(false)} {...register("centroCusto")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Salário</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("salario", { valueAsNumber: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Proventos</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("proventos", { valueAsNumber: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Descontos</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("descontos", { valueAsNumber: true })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="field-label">Líquido</span>
        <input type="number" step="0.01" className={inputClass(false)} {...register("liquido", { valueAsNumber: true })} />
      </label>

      <p className="sm:col-span-2 text-xs text-text-subtle -mt-1">
        Essa correção vale apenas para esta sessão (visualização e exportação atuais) — não é salva permanentemente no histórico.
      </p>

      <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Salvar correção
        </button>
      </div>
    </form>
  );
}
