import type { Colaborador } from "@/lib/types/payroll";

// Layout "detalhado" de exportação do Extrato Mensal (usado por ./csv). A ordem dos cabeçalhos precisa
// bater com a ordem do array devolvido por `colaboradorToRow`.

/** Cabeçalhos das colunas da exportação detalhada. */
export const COLABORADOR_HEADERS = [
  "Empresa",
  "Código",
  "Nome",
  "CPF",
  "Admissão",
  "Situação",
  "Vínculo",
  "Horas Mês",
  "Departamento",
  "Centro de Custo",
  "Código do Cargo",
  "Cargo",
  "CBO",
  "Filial",
  "Salário",
  "Proventos",
  "Descontos",
  "Líquido",
  "Informativa",
  "Informativa Dedutora",
  "Base INSS",
  "Base FGTS",
  "Base IRRF",
  "Excedente INSS",
  "Valor FGTS",
  "Observações",
  "Campos com baixa confiança",
] as const;

/** Converte um colaborador numa linha alinhada a COLABORADOR_HEADERS (listas unidas em texto). */
export function colaboradorToRow(c: Colaborador): (string | number)[] {
  return [
    c.empresaNome || "",
    c.codigo,
    c.nome,
    c.cpf,
    c.admissao,
    c.situacao,
    c.vinculo,
    c.horasMes,
    c.departamento,
    c.centroCusto,
    c.cargoCodigo,
    c.cargo,
    c.cbo,
    c.filial,
    c.salario,
    c.proventos,
    c.descontos,
    c.liquido,
    c.informativa,
    c.informativaDedutora,
    c.baseINSS,
    c.baseFGTS,
    c.baseIRRF,
    c.excedenteINSS,
    c.valorFGTS,
    c.observacoes.join("; "),
    c.camposBaixaConfianca.join(", "),
  ];
}
