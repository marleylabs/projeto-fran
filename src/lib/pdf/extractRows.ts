// Extração de texto do PDF preservando posição (x, y) de cada item.
//
// O "Extrato Mensal" desenha rótulo e valor em colunas diferentes, e a ordem em
// que o pdf.js devolve os itens de texto (ordem do content stream) não é a
// ordem visual esquerda->direita. Por isso extraímos cada item com sua posição
// e reconstruímos as linhas nós mesmos, agrupando por Y e ordenando por X —
// isso reflete fielmente o que um humano lendo o PDF veria.

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

export interface PdfRow {
  y: number;
  items: PdfTextItem[];
}

export interface PdfPageRows {
  pageNumber: number;
  rows: PdfRow[];
}

export interface PdfExtractionResult {
  pages: PdfPageRows[];
  /** false quando o PDF não contém texto extraível (provável imagem escaneada). */
  hasExtractableText: boolean;
}

/** Itens cuja diferença de Y é menor que essa tolerância (pt) são considerados a mesma linha. */
const ROW_Y_TOLERANCE = 2;

export async function extractPdfRows(fileBuffer: Buffer | ArrayBuffer): Promise<PdfExtractionResult> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = fileBuffer instanceof Buffer ? new Uint8Array(fileBuffer) : new Uint8Array(fileBuffer);
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true } as never);
  const doc = await loadingTask.promise;

  const pages: PdfPageRows[] = [];
  let totalChars = 0;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform: number[] };
      const text = (item.str ?? "").trim();
      if (!text) continue;
      totalChars += text.length;
      items.push({ text, x: item.transform[4], y: item.transform[5] });
    }

    pages.push({ pageNumber, rows: groupIntoRows(items) });
  }

  return { pages, hasExtractableText: totalChars > 20 };
}

function groupIntoRows(items: PdfTextItem[]): PdfRow[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: PdfRow[] = [];
  for (const item of sorted) {
    const currentRow = rows[rows.length - 1];
    if (currentRow && Math.abs(currentRow.y - item.y) <= ROW_Y_TOLERANCE) {
      currentRow.items.push(item);
      // Recentraliza a referência de Y da linha pela média, para tolerar leve deriva.
      currentRow.y = (currentRow.y + item.y) / 2;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }

  return rows;
}

/** Concatena o texto de uma linha (ordem visual) — útil para regex e para o texto bruto de auditoria. */
export function rowText(row: PdfRow): string {
  return row.items.map((i) => i.text).join(" ");
}
