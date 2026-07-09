import type { PdfRow } from "@/lib/pdf/extractRows";
import { extractLabelValues } from "./rowHelpers";

export const ROW1_LABELS = ["Empr.:", "Situação:", "CPF:", "Adm:"];
export const ROW2_LABELS = ["Vínculo:", "CC:", "Depto:", "Horas Mês:"];
export const ROW3_LABELS = ["Cargo:", "C.B.O:", "Filial:", "Salário:"];
export const ND_LABELS = ["ND:", "Proventos:", "Descontos:", "Informativa:", "Informativa Dedutora:", "Líquido:"];
export const NF_LABELS = ["NF:", "Base INSS:", "Excedente INSS:", "Base FGTS:", "Valor FGTS:", "Base IRRF:"];

export function isRow1(row: PdfRow) {
  return row.items.some((i) => i.text.trim() === "Empr.:");
}
export function isRow2(row: PdfRow) {
  return row.items.some((i) => i.text.trim() === "Vínculo:");
}
export function isRow3(row: PdfRow) {
  return row.items.some((i) => i.text.trim() === "Cargo:");
}
export function isNDRow(row: PdfRow) {
  return row.items.some((i) => i.text.trim() === "ND:");
}
export function isNFRow(row: PdfRow) {
  return row.items.some((i) => i.text.trim() === "NF:");
}

export function parseRow1(row: PdfRow) {
  return extractLabelValues(row, ROW1_LABELS);
}
export function parseRow2(row: PdfRow) {
  return extractLabelValues(row, ROW2_LABELS);
}
export function parseRow3(row: PdfRow) {
  return extractLabelValues(row, ROW3_LABELS);
}
export function parseNDRow(row: PdfRow) {
  return extractLabelValues(row, ND_LABELS);
}
export function parseNFRow(row: PdfRow) {
  return extractLabelValues(row, NF_LABELS);
}

/** Separa "28 ALAN JOSE DOS SANTOS FARIAS" em código de matrícula + nome completo. */
export function splitCodigoNome(value: string | undefined): { codigo: string; nome: string } {
  if (!value) return { codigo: "", nome: "" };
  const match = value.match(/^(\d+)\s+(.+)$/);
  if (match) return { codigo: match[1], nome: match[2].trim() };
  return { codigo: "", nome: value.trim() };
}

/** Separa "2576 PROJETISTA SÊNIOR" em código do cargo + descrição do cargo. */
export function splitCodigoCargo(value: string | undefined): { cargoCodigo: string; cargo: string } {
  if (!value) return { cargoCodigo: "", cargo: "" };
  const match = value.match(/^(\d+)\s+(.+)$/);
  if (match) return { cargoCodigo: match[1], cargo: match[2].trim() };
  return { cargoCodigo: "", cargo: value.trim() };
}
