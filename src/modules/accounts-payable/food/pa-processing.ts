// Leitura do XLSX de rateio de Alimentação PA enviado pelo fornecedor. Função pura (sem banco), consumida por
// pa-server.ts. Exige a aba "RATEIO 2.0" com a tabela do Excel "RateioOficial" e as colunas obrigatórias de
// FOOD_PA_REQUIRED_COLUMNS (DATA, NOME, DPTO, EMISSÃO NF, RESTAURANTE, VALOR). Cada linha = uma refeição com
// o VALOR cobrado pelo fornecedor (preservado como string decimal; nunca convertido para float ao gravar).
import ExcelJS from "exceljs";
import { normalizeOrganizationalValue } from "@/lib/organizational-label";
import { normalizeHeader } from "@/modules/accounts-payable/shared/spreadsheet";
import { normalizeFoodName } from "./ma-processing";
import { FOOD_PA_REQUIRED_COLUMNS } from "./columns";

/** Linha válida do rateio PA. amount é string decimal normalizada (ponto como separador). */
export type FoodPaOccurrence = {
  sourceRow: number;
  occurredOn: Date;
  receivedName: string;
  normalizedReceivedName: string;
  receivedDepartment: string;
  invoiceEmission: string;
  restaurantName: string;
  amount: string;
};
/** Inconsistência de leitura (aba/tabela/coluna ausente ou linha inválida). */
export type FoodPaIssue = {
  sourceRow: number | null;
  employeeName: string | null;
  code: string;
  message: string;
};
/** Resultado da leitura: total de linhas de dados, ocorrências válidas e inconsistências. */
export type FoodPaResult = {
  totalRows: number;
  occurrences: FoodPaOccurrence[];
  issues: FoodPaIssue[];
};
// Texto da célula: rich text/hyperlink do ExcelJS expõem `.text`; demais valores viram string com espaços normalizados.
const cellText = (value: unknown) =>
  typeof value === "object" && value && "text" in value
    ? String(value.text)
    : String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");

/**
 * Converte a DATA do PA em meia-noite UTC. Aceita Date do ExcelJS, serial numérico do Excel (base 30/12/1899),
 * dd/mm/aaaa, aaaa-mm-dd e, por último, qualquer texto que o Date entenda. Retorna null se inválida.
 */
export function parsePaDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.round(value * 86400000),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = cellText(value);
  let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (match)
    return new Date(
      Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])),
    );
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match)
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(
        Date.UTC(
          parsed.getUTCFullYear(),
          parsed.getUTCMonth(),
          parsed.getUTCDate(),
        ),
      );
}

/**
 * Converte o VALOR em string decimal (ex.: "R$ 1.234,56" → "1234.56"; número → 4 casas).
 * Com vírgula, ponto é tratado como milhar. Retorna null para vazio, texto inválido ou valor negativo.
 */
export function parsePaMoney(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value))
    return value.toFixed(4);
  const text = cellText(value).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!text) return null;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  return /^-?\d+(\.\d+)?$/.test(normalized) && Number(normalized) >= 0
    ? normalized
    : null;
}

/**
 * Lê o XLSX do PA. O cabeçalho é a primeira linha da tabela RateioOficial (table.ref); as linhas seguintes da
 * aba são lidas até o fim. Linhas vazias são ignoradas; linha com qualquer campo obrigatório ausente vira
 * INVALID_ROW. Falta de aba/tabela/coluna retorna só a inconsistência, sem ocorrências.
 */
export async function parseFoodPaXlsx(buffer: Buffer): Promise<FoodPaResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.getWorksheet("RATEIO 2.0");
  if (!worksheet)
    return {
      totalRows: 0,
      occurrences: [],
      issues: [
        {
          sourceRow: null,
          employeeName: null,
          code: "MISSING_SHEET",
          message: "A aba RATEIO 2.0 não foi encontrada.",
        },
      ],
    };
  const table = worksheet.getTable("RateioOficial");
  if (!table)
    return {
      totalRows: Math.max(0, worksheet.rowCount - 1),
      occurrences: [],
      issues: [
        {
          sourceRow: null,
          employeeName: null,
          code: "MISSING_TABLE",
          message:
            "A tabela RateioOficial não foi encontrada na aba RATEIO 2.0.",
        },
      ],
    };
  // table.ref nem sempre é exposto pelo ExcelJS; cai para o modelo interno (tableRef) e, em último caso, A1.
  const tableReference = table.ref ?? (table as unknown as { table?: { tableRef?: string } }).table?.tableRef ?? "A1";
  const headerRow = tableReference.match(/\d+/)?.[0]
    ? Number(tableReference.match(/\d+/)?.[0])
    : 1;
  const headers = worksheet.getRow(headerRow).values as unknown[];
  const indexes = new Map<string, number>();
  headers.forEach((value, index) => indexes.set(normalizeHeader(value), index));
  const required = FOOD_PA_REQUIRED_COLUMNS.map(normalizeHeader);
  const missing = required.filter((header) => !indexes.has(header));
  if (missing.length)
    return {
      totalRows: 0,
      occurrences: [],
      issues: [
        {
          sourceRow: headerRow,
          employeeName: null,
          code: "MISSING_COLUMNS",
          message: `Coluna(s) obrigatória(s) não encontrada(s): ${missing.join(", ")}.`,
        },
      ],
    };
  const occurrences: FoodPaOccurrence[] = [];
  const issues: FoodPaIssue[] = [];
  for (
    let sourceRow = headerRow + 1;
    sourceRow <= worksheet.rowCount;
    sourceRow += 1
  ) {
    const row = worksheet.getRow(sourceRow);
    const values = row.values as unknown[];
    if (!values.some((value) => cellText(value))) continue;
    const name = cellText(row.getCell(indexes.get("nome")!).value);
    const department = cellText(row.getCell(indexes.get("dpto")!).value);
    const invoiceEmission = cellText(
      row.getCell(indexes.get("emissao nf")!).value,
    );
    const restaurantName = cellText(
      row.getCell(indexes.get("restaurante")!).value,
    );
    const occurredOn = parsePaDate(row.getCell(indexes.get("data")!).value);
    const amount = parsePaMoney(row.getCell(indexes.get("valor")!).value);
    if (
      !occurredOn ||
      !name ||
      !department ||
      !invoiceEmission ||
      !restaurantName ||
      !amount
    ) {
      issues.push({
        sourceRow,
        employeeName: name || null,
        code: "INVALID_ROW",
        message: !occurredOn
          ? "DATA inválida."
          : !amount
            ? "VALOR inválido."
            : "Registro parcial; preencha NOME, DPTO, EMISSÃO NF e RESTAURANTE.",
      });
      continue;
    }
    occurrences.push({
      sourceRow,
      occurredOn,
      receivedName: name,
      normalizedReceivedName: normalizeFoodName(name),
      receivedDepartment: normalizeOrganizationalValue(department),
      invoiceEmission,
      restaurantName,
      amount,
    });
  }
  return {
    totalRows: Math.max(0, worksheet.rowCount - headerRow),
    occurrences,
    issues,
  };
}
