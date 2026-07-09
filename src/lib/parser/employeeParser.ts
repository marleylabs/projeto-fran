import type { PdfRow } from "@/lib/pdf/extractRows";
import { rowText } from "@/lib/pdf/extractRows";
import type { EmployeeBlock } from "./segmentEmployees";
import {
  isNDRow,
  isNFRow,
  isRow1,
  isRow2,
  isRow3,
  parseNDRow,
  parseNFRow,
  parseRow1,
  parseRow2,
  parseRow3,
  splitCodigoCargo,
  splitCodigoNome,
} from "./employeeFields";
import { looksLikeRubricaRow, parseRubricaRow } from "./rubricaParser";
import { isValidCpfFormat, isValidDateFormat, parseBRNumber } from "@/lib/normalize/money";
import type { Colaborador, Rubrica } from "@/lib/types/payroll";

function requireNumber(raw: string | undefined, fieldName: string, lowConfidence: string[]): number {
  const value = parseBRNumber(raw);
  if (value === null) {
    lowConfidence.push(fieldName);
    return 0;
  }
  return value;
}

export function parseEmployeeBlock(block: EmployeeBlock, index: number): Colaborador {
  const lowConfidence: string[] = [];
  const rubricas: Rubrica[] = [];
  const observacoes: string[] = [];

  let row1: PdfRow | undefined;
  let row2: PdfRow | undefined;
  let row3: PdfRow | undefined;
  let ndRow: PdfRow | undefined;
  let nfRow: PdfRow | undefined;

  for (const row of block.rows) {
    if (!row1 && isRow1(row)) {
      row1 = row;
      continue;
    }
    if (!row2 && isRow2(row)) {
      row2 = row;
      continue;
    }
    if (!row3 && isRow3(row)) {
      row3 = row;
      continue;
    }
    if (!ndRow && isNDRow(row)) {
      ndRow = row;
      continue;
    }
    if (!nfRow && isNFRow(row)) {
      nfRow = row;
      continue;
    }
    if (row.items.length === 1) {
      observacoes.push(row.items[0].text.trim());
      continue;
    }
    if (looksLikeRubricaRow(row)) {
      rubricas.push(...parseRubricaRow(row));
    }
  }

  const fields1 = row1 ? parseRow1(row1) : {};
  const fields2 = row2 ? parseRow2(row2) : {};
  const fields3 = row3 ? parseRow3(row3) : {};
  const fieldsND = ndRow ? parseNDRow(ndRow) : {};
  const fieldsNF = nfRow ? parseNFRow(nfRow) : {};

  const { codigo, nome } = splitCodigoNome(fields1["Empr.:"]);
  const { cargoCodigo, cargo } = splitCodigoCargo(fields3["Cargo:"]);

  const cpf = fields1["CPF:"] ?? "";
  const admissao = fields1["Adm:"] ?? "";
  const salarioOriginal = fields3["Salário:"] ?? "";

  if (!codigo) lowConfidence.push("codigo");
  if (!nome) lowConfidence.push("nome");
  if (!cpf || !isValidCpfFormat(cpf)) lowConfidence.push("cpf");
  if (!admissao || !isValidDateFormat(admissao)) lowConfidence.push("admissao");
  if (!row2) lowConfidence.push("vinculo", "centroCusto", "departamento", "horasMes");
  if (!row3) lowConfidence.push("cargo", "cbo", "filial", "salario");
  if (!ndRow) lowConfidence.push("proventos", "descontos", "liquido", "informativa", "informativaDedutora");
  if (!nfRow) lowConfidence.push("baseINSS", "baseFGTS", "baseIRRF", "excedenteINSS", "valorFGTS");

  const colaborador: Colaborador = {
    id: codigo || `sem-codigo-${index}`,
    codigo,
    nome,
    cpf,
    admissao,
    situacao: (fields1["Situação:"] ?? "") as Colaborador["situacao"],
    vinculo: fields2["Vínculo:"] ?? "",
    horasMes: fields2["Horas Mês:"] ?? "",
    departamento: fields2["Depto:"] ?? "",
    centroCusto: fields2["CC:"] ?? "",
    cargoCodigo,
    cargo,
    cbo: fields3["C.B.O:"] ?? "",
    filial: fields3["Filial:"] ?? "",
    salario: requireNumber(salarioOriginal, "salario", lowConfidence),
    salarioOriginal,
    proventos: requireNumber(fieldsND["Proventos:"], "proventos", lowConfidence),
    descontos: requireNumber(fieldsND["Descontos:"], "descontos", lowConfidence),
    liquido: requireNumber(fieldsND["Líquido:"], "liquido", lowConfidence),
    informativa: requireNumber(fieldsND["Informativa:"], "informativa", lowConfidence),
    informativaDedutora: requireNumber(fieldsND["Informativa Dedutora:"], "informativaDedutora", lowConfidence),
    baseINSS: requireNumber(fieldsNF["Base INSS:"], "baseINSS", lowConfidence),
    baseFGTS: requireNumber(fieldsNF["Base FGTS:"], "baseFGTS", lowConfidence),
    baseIRRF: requireNumber(fieldsNF["Base IRRF:"], "baseIRRF", lowConfidence),
    excedenteINSS: requireNumber(fieldsNF["Excedente INSS:"], "excedenteINSS", lowConfidence),
    valorFGTS: requireNumber(fieldsNF["Valor FGTS:"], "valorFGTS", lowConfidence),
    rubricas,
    observacoes,
    textoBruto: block.rows.map(rowText).join("\n"),
    camposBaixaConfianca: [...new Set(lowConfidence)],
  };

  return colaborador;
}
