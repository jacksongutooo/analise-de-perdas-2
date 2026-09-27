// "@/lib/extraction/readers" na prévia: CSV como no site real; PDF com o leitor da prévia e, se preciso,
// o pdf.js do CDN; XLSX não é lido automaticamente na prévia (o site real lê).
import { linesFromPdfDocument, readCsvRows } from "../../../src/lib/extraction/readers";
import { looksReadable, openWithPdfJs, simplePdfLines } from "../runtime/pdf";

export { linesFromPdfDocument, readCsvRows };
export type { PdfDocumentLike } from "../../../src/lib/extraction/readers";

export async function readXlsxSheets(): Promise<unknown[][][]> {
  throw new Error("Na prévia, planilhas XLSX não são lidas automaticamente (no site real, são).");
}

export async function readPdfLines(buf: Uint8Array, maxPages = 40): Promise<string[]> {
  const simple = await simplePdfLines(buf).catch(() => []);
  if (looksReadable(simple)) return simple;
  const pdf = await openWithPdfJs(buf);
  try {
    return await linesFromPdfDocument(pdf, maxPages);
  } finally {
    await pdf.destroy?.();
  }
}
