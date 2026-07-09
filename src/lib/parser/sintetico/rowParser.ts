import type { PdfRow } from "@/lib/pdf/extractRows";
import { rowText } from "@/lib/pdf/extractRows";
import { parseBRNumber } from "@/lib/normalize/money";
import type { LinhaSintetico } from "@/lib/types/sintetico";
import { buildColumnAnchors, isHeaderRow, nearestField, type ColumnAnchor } from "./columnAnchors";
import { SINTETICO_NUMERIC_FIELDS, type SinteticoFieldKey } from "./fieldSequence";

const CODIGO_REGEX = /^\d{4,8}$/;

function isDataRowStart(row: PdfRow): boolean {
  const first = row.items[0]?.text.trim();
  return !!first && CODIGO_REGEX.test(first);
}

function isTotalGeralRow(row: PdfRow): boolean {
  const first = row.items[0]?.text.trim().toUpperCase();
  const second = row.items[1]?.text.trim().toUpperCase();
  return first === "TOTAL" && second === "GERAL";
}

type FieldMap = Partial<Record<SinteticoFieldKey, string>>;

function assignRowToFields(row: PdfRow, anchors: ColumnAnchor[]): FieldMap {
  const map: FieldMap = {};
  for (const item of row.items) {
    const text = item.text.trim();
    if (!text) continue;
    const field = nearestField(anchors, item.x);
    map[field] = map[field] ? `${map[field]} ${text}` : text;
  }
  return map;
}

function looksIncomplete(map: FieldMap): boolean {
  const hasIdentity = !!map.mat && !!map.nome;
  const hasAnyNumber = SINTETICO_NUMERIC_FIELDS.some((f) => map[f] !== undefined);
  return hasIdentity && !hasAnyNumber;
}

function readNumber(map: FieldMap, field: SinteticoFieldKey, camposBaixaConfianca: string[]): number {
  const raw = map[field];
  if (raw === undefined) {
    camposBaixaConfianca.push(field);
    return 0;
  }
  const value = parseBRNumber(raw);
  if (value === null) {
    camposBaixaConfianca.push(field);
    return 0;
  }
  return value;
}

export interface SinteticoRowParseOutcome {
  linhas: LinhaSintetico[];
  totalGeralRow: PdfRow | null;
  /** Linhas que não são cabeçalho nem dado de colaborador — candidatas a info da empresa/rodapé. */
  otherRows: PdfRow[];
  anchorsFound: boolean;
}

export function parseSinteticoRows(allRows: PdfRow[]): SinteticoRowParseOutcome {
  let anchors: ColumnAnchor[] | null = null;
  let anchorsFound = false;
  const linhas: LinhaSintetico[] = [];
  const otherRows: PdfRow[] = [];
  let totalGeralRow: PdfRow | null = null;

  let i = 0;
  while (i < allRows.length) {
    const row = allRows[i];

    if (isHeaderRow(row)) {
      const built = buildColumnAnchors(row);
      if (built) {
        anchors = built;
        anchorsFound = true;
      }
      i++;
      continue;
    }

    if (isTotalGeralRow(row)) {
      totalGeralRow = row;
      i++;
      continue;
    }

    if (anchors && isDataRowStart(row)) {
      const map = assignRowToFields(row, anchors);
      let mergedRow: PdfRow | null = null;

      if (looksIncomplete(map) && i + 1 < allRows.length) {
        const next = allRows[i + 1];
        if (!isHeaderRow(next) && !isDataRowStart(next) && !isTotalGeralRow(next)) {
          const extra = assignRowToFields(next, anchors);
          for (const key of Object.keys(extra) as SinteticoFieldKey[]) {
            if (map[key] === undefined) map[key] = extra[key];
          }
          mergedRow = next;
        }
      }

      const camposBaixaConfianca: string[] = [];
      const mat = map.mat ?? "";
      const nome = map.nome ?? "";
      if (!mat) camposBaixaConfianca.push("mat");
      if (!nome) camposBaixaConfianca.push("nome");

      const he = readNumber(map, "he", camposBaixaConfianca);
      const dsr = readNumber(map, "dsr", camposBaixaConfianca);

      const linha: LinhaSintetico = {
        id: mat || `sem-mat-${linhas.length}`,
        mat,
        nome,
        ch: map.ch ?? "",
        salario: readNumber(map, "salario", camposBaixaConfianca),
        salarioOriginal: map.salario ?? "",
        he,
        dsr,
        totalHE: Math.round((he + dsr) * 100) / 100,
        salFamilia: readNumber(map, "salFamilia", camposBaixaConfianca),
        adcNoturno: readNumber(map, "adcNoturno", camposBaixaConfianca),
        periculosidade: readNumber(map, "periculosidade", camposBaixaConfianca),
        insalubridade: readNumber(map, "insalubridade", camposBaixaConfianca),
        outrosProventos: readNumber(map, "outrosProventos", camposBaixaConfianca),
        total: readNumber(map, "total", camposBaixaConfianca),
        inss: readNumber(map, "inss", camposBaixaConfianca),
        vt: readNumber(map, "vt", camposBaixaConfianca),
        descAut: readNumber(map, "descAut", camposBaixaConfianca),
        ir: readNumber(map, "ir", camposBaixaConfianca),
        outros: readNumber(map, "outros", camposBaixaConfianca),
        totalDesc: readNumber(map, "totalDesc", camposBaixaConfianca),
        liquido: readNumber(map, "liquido", camposBaixaConfianca),
        textoBruto: mergedRow ? `${rowText(row)}\n${rowText(mergedRow)}` : rowText(row),
        camposBaixaConfianca,
      };

      linhas.push(linha);
      i += mergedRow ? 2 : 1;
      continue;
    }

    otherRows.push(row);
    i++;
  }

  return { linhas, totalGeralRow, otherRows, anchorsFound };
}
