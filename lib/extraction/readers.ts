// Leitores de arquivo. Importações dinâmicas: uma falha aqui afeta só a leitura automática.

function decodeText(buf: Buffer): string {
  let text = buf.toString("utf8");
  if (text.includes("\uFFFD")) text = buf.toString("latin1");
  return text.replace(/^\uFEFF/, "");
}

export async function readCsvRows(buf: Buffer): Promise<unknown[][]> {
  const mod: any = await import("papaparse");
  const Papa = mod.default ?? mod;
  const result = Papa.parse(decodeText(buf), { skipEmptyLines: true });
  return (result.data as unknown[][]).slice(0, 50_000);
}

export async function readXlsxSheets(buf: Buffer): Promise<unknown[][][]> {
  const mod: any = await import("xlsx");
  const XLSX = mod.read ? mod : mod.default;
  const workbook = XLSX.read(buf, { type: "buffer", cellDates: true, dense: true });
  const sheets: unknown[][][] = [];
  for (const name of (workbook.SheetNames as string[]).slice(0, 5)) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];
    sheets.push(rows.slice(0, 50_000));
  }
  return sheets;
}

type TextItemLike = { str?: string; transform?: number[] };
type PdfPageLike = { getTextContent(): Promise<{ items: unknown[] }> };
export type PdfDocumentLike = { numPages: number; getPage(n: number): Promise<PdfPageLike> };

/** Reconstrói as linhas visuais de um PDF agrupando os trechos de texto pela posição vertical. */
export async function linesFromPdfDocument(pdf: PdfDocumentLike, maxPages = 40): Promise<string[]> {
  const lines: string[] = [];
  const pages = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const raw of content.items) {
      const item = raw as TextItemLike;
      if (!item.str || !item.transform) continue;
      const y = Math.round((item.transform[5] ?? 0) / 2) * 2;
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4] ?? 0, text: item.str });
      rows.set(y, row);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const text = (rows.get(y) ?? [])
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) lines.push(text);
    }
  }
  return lines;
}

export async function readPdfLines(buf: Buffer, maxPages = 40): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  try {
    return await linesFromPdfDocument(pdf as unknown as PdfDocumentLike, maxPages);
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}
