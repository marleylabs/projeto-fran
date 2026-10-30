// Leitura da tabela de rubricas de cada colaborador do Extrato Mensal. Usado por employeeParser.ts.

import type { PdfRow, PdfTextItem } from "@/lib/pdf/extractRows";
import { parseBRNumber } from "@/lib/normalize/money";
import type { Rubrica, RubricaTipo } from "@/lib/types/payroll";

// A tabela de rubricas é impressa em duas colunas lado a lado (proventos à
// esquerda, descontos à direita). O ponto de corte em X foi calibrado a partir
// das coordenadas reais do PDF de exemplo: proventos ficam sempre < 285pt,
// descontos sempre >= 285pt.
const COLUMN_SPLIT_X = 285;

function splitColumns(row: PdfRow): { left: PdfTextItem[]; right: PdfTextItem[] } {
  const left = row.items.filter((i) => i.x < COLUMN_SPLIT_X);
  const right = row.items.filter((i) => i.x >= COLUMN_SPLIT_X);
  return { left, right };
}

/** Separa "8781 DIAS NORMAIS" em código + descrição; também aceita código e descrição já como itens separados. */
function parseCodigoDescricao(tokens: string[], startIdx: number): { codigo: string; descricao: string; nextIdx: number } {
  const first = tokens[startIdx] ?? "";
  const combined = first.match(/^(\d+)\s+(.+)$/);
  if (combined) {
    return { codigo: combined[1], descricao: combined[2].trim(), nextIdx: startIdx + 1 };
  }
  if (/^\d+$/.test(first) && tokens[startIdx + 1]) {
    return { codigo: first, descricao: tokens[startIdx + 1].trim(), nextIdx: startIdx + 2 };
  }
  return { codigo: "", descricao: first, nextIdx: startIdx + 1 };
}

// Coluna de proventos: código descrição [referência] valor "P". Com marcador e código, a confiança é alta.
function parseProvento(items: PdfTextItem[]): Rubrica | null {
  const tokens = items.map((i) => i.text.trim());
  if (tokens.length === 0) return null;

  const { codigo, descricao, nextIdx } = parseCodigoDescricao(tokens, 0);
  const rest = tokens.slice(nextIdx);

  const hasMarker = rest[rest.length - 1] === "P";
  const withoutMarker = hasMarker ? rest.slice(0, -1) : rest;
  const valorStr = withoutMarker[withoutMarker.length - 1];
  const referencia = withoutMarker.length >= 2 ? withoutMarker[withoutMarker.length - 2] : undefined;

  const valor = parseBRNumber(valorStr);
  if (valor === null) return null;

  return {
    codigo,
    descricao,
    tipo: "Provento",
    referencia,
    valor,
    valorOriginal: valorStr,
    confianca: hasMarker && codigo ? "alta" : "baixa",
  };
}

// Coluna de descontos: código descrição [referência] "valor D" (marcador grudado no valor).
function parseDesconto(items: PdfTextItem[]): Rubrica | null {
  const tokens = items.map((i) => i.text.trim());
  if (tokens.length === 0) return null;

  const { codigo, descricao, nextIdx } = parseCodigoDescricao(tokens, 0);
  const rest = tokens.slice(nextIdx);
  if (rest.length === 0) return null;

  const last = rest[rest.length - 1];
  const match = last.match(/^([\d.,]+)\s*D$/);
  const valorStr = match ? match[1] : last;
  const referencia = rest.length >= 2 ? rest[rest.length - 2] : undefined;

  const valor = parseBRNumber(valorStr);
  if (valor === null) return null;

  return {
    codigo,
    descricao,
    tipo: "Desconto",
    referencia,
    valor,
    valorOriginal: valorStr,
    confianca: match && codigo ? "alta" : "baixa",
  };
}

/** true se a linha parece ser uma linha de rubrica (tabela em colunas), e não um texto livre de observação. */
export function looksLikeRubricaRow(row: PdfRow): boolean {
  return row.items.length > 1;
}

/** Lê uma linha da tabela e devolve 0, 1 ou 2 rubricas (provento e/ou desconto); valor ilegível descarta o lado. */
export function parseRubricaRow(row: PdfRow): Rubrica[] {
  const { left, right } = splitColumns(row);
  const rubricas: Rubrica[] = [];

  const provento = parseProvento(left);
  if (provento) rubricas.push(provento);

  const desconto = parseDesconto(right);
  if (desconto) rubricas.push(desconto);

  return rubricas;
}

/** Mapeia marcador (P, D, I, ID) para RubricaTipo; desconhecido vira "Informativa". Sem uso atual no projeto. */
export function classifyMarkerToTipo(marker: string): RubricaTipo {
  switch (marker) {
    case "P":
      return "Provento";
    case "D":
      return "Desconto";
    case "I":
      return "Informativa";
    case "ID":
      return "Informativa Dedutora";
    default:
      return "Informativa";
  }
}
