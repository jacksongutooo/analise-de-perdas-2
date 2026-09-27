// Leitura de PDF na prévia. Primeiro um leitor próprio, leve e sem rede, para PDFs simples
// (texto em fontes padrão, com ou sem compressão). Se ele não encontrar texto legível, usa o pdf.js
// carregado do CDN (a mesma biblioteca que o site real usa no servidor, via unpdf).
import { bytesToLatin1 } from "../shims/buffer";

export const PDFJS_VERSION = "4.10.38";
const PDFJS_ROOT = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/`;
const PDFJS_BASE = `${PDFJS_ROOT}build/`;

let pdfjsPromise: Promise<any> | null = null;

export function loadPdfJs(): Promise<any> {
  pdfjsPromise ??= (async () => {
    const url = `${PDFJS_BASE}pdf.min.mjs`;
    const lib = await import(/* @vite-ignore */ url);
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
    return lib;
  })().catch((error) => {
    pdfjsPromise = null;
    throw error;
  });
  return pdfjsPromise;
}

export async function openWithPdfJs(bytes: Uint8Array): Promise<any> {
  const lib = await loadPdfJs();
  return lib.getDocument({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    standardFontDataUrl: `${PDFJS_ROOT}standard_fonts/`,
    cMapUrl: `${PDFJS_ROOT}cmaps/`,
    cMapPacked: true,
  }).promise;
}

// ─── Leitor próprio ───────────────────────────────────────────────────────
const WIN_ANSI: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Conteúdos das páginas (streams), descomprimidos quando usam FlateDecode. */
async function contentStreams(bytes: Uint8Array): Promise<string[]> {
  const raw = bytesToLatin1(bytes);
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const dictEnd = raw.lastIndexOf(">>", match.index);
    const dictStart = raw.lastIndexOf("<<", dictEnd);
    if (dictEnd < 0 || dictStart < 0 || match.index - dictEnd > 4) continue;
    const dict = raw.slice(dictStart, dictEnd + 2);
    if (/\/(Type\s*\/(XObject|XRef|ObjStm|Metadata)|Subtype\s*\/Image|Length1)/.test(dict)) continue;
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    re.lastIndex = end;
    let data: Uint8Array | null = bytes.subarray(start, end);
    if (/\/Filter\s*\/FlateDecode/.test(dict) || /\/Filter\s*\[\s*\/FlateDecode\s*\]/.test(dict)) data = await inflate(data);
    else if (/\/Filter/.test(dict)) data = null;
    if (data) out.push(bytesToLatin1(data));
  }
  return out;
}

type Item = { x: number; y: number; text: string; order: number };

function decodeLiteral(src: string, start: number): [string, number] {
  // src[start] === "("; devolve o texto e a posição depois do ")".
  let depth = 1;
  let i = start + 1;
  const bytes: number[] = [];
  while (i < src.length && depth > 0) {
    const c = src[i]!;
    if (c === "\\") {
      const n = src[i + 1] ?? "";
      const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (n in map) {
        bytes.push(map[n]!);
        i += 2;
      } else if (/[0-7]/.test(n)) {
        const oct = /^[0-7]{1,3}/.exec(src.slice(i + 1, i + 4))![0];
        bytes.push(Number.parseInt(oct, 8) & 0xff);
        i += 1 + oct.length;
      } else {
        i += 2; // quebra de linha escapada ou caractere desconhecido
      }
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth > 0) bytes.push(c.charCodeAt(0));
    i++;
  }
  return [bytes.map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join(""), i];
}

function decodeHex(hex: string): string {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  let out = "";
  for (let i = 0; i < clean.length; i += 2) {
    const b = Number.parseInt((clean.slice(i, i + 2) + "0").slice(0, 2), 16);
    out += WIN_ANSI[b] ?? String.fromCharCode(b);
  }
  return out;
}

function parseContent(src: string, items: Item[]) {
  const stack: (number | string | { str: string } | (number | { str: string })[])[] = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let lm = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let fontSize = 10;
  let i = 0;
  const push = (text: string) => {
    if (text) items.push({ x: tm[4]!, y: tm[5]!, text, order: items.length });
  };
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "%") {
      i = src.indexOf("\n", i) + 1 || src.length;
      continue;
    }
    if (c === "(") {
      const [text, next] = decodeLiteral(src, i);
      stack.push({ str: text });
      i = next;
      continue;
    }
    if (c === "<" && src[i + 1] !== "<") {
      const end = src.indexOf(">", i);
      stack.push({ str: decodeHex(src.slice(i + 1, end)) });
      i = end + 1;
      continue;
    }
    if (c === "<" || c === ">") {
      i += 2; // dicionários inline são ignorados
      continue;
    }
    if (c === "[") {
      const arr: (number | { str: string })[] = [];
      i++;
      while (i < src.length && src[i] !== "]") {
        const ch = src[i]!;
        if (ch === "(") {
          const [text, next] = decodeLiteral(src, i);
          arr.push({ str: text });
          i = next;
        } else if (ch === "<") {
          const end = src.indexOf(">", i);
          arr.push({ str: decodeHex(src.slice(i + 1, end)) });
          i = end + 1;
        } else if (/[-+.\d]/.test(ch)) {
          const m = /^[-+]?\d*\.?\d+/.exec(src.slice(i));
          if (m) {
            arr.push(Number(m[0]));
            i += m[0].length;
          } else i++;
        } else i++;
      }
      stack.push(arr);
      i++;
      continue;
    }
    if (c === "/") {
      const m = /^\/[^\s/<>[\]()%]*/.exec(src.slice(i))!;
      stack.push(m[0]);
      i += m[0].length;
      continue;
    }
    if (/[-+.\d]/.test(c)) {
      const m = /^[-+]?\d*\.?\d+/.exec(src.slice(i));
      if (m) {
        stack.push(Number(m[0]));
        i += m[0].length;
        continue;
      }
    }
    const m = /^[A-Za-z'"*]+/.exec(src.slice(i));
    if (!m) {
      i++;
      continue;
    }
    const op = m[0];
    i += op.length;
    if (op === "BI") {
      const end = src.indexOf("EI", i);
      i = end < 0 ? src.length : end + 2;
      stack.length = 0;
      continue;
    }
    const nums = () => stack.filter((v): v is number => typeof v === "number");
    switch (op) {
      case "BT":
        tm = [1, 0, 0, 1, 0, 0];
        lm = [1, 0, 0, 1, 0, 0];
        break;
      case "Tf":
        fontSize = Math.abs(nums().at(-1) ?? fontSize) || fontSize;
        break;
      case "TL":
        leading = nums().at(-1) ?? leading;
        break;
      case "Tm": {
        const n = nums().slice(-6);
        if (n.length === 6) {
          tm = n;
          lm = [...n];
        }
        break;
      }
      case "Td":
      case "TD": {
        const [tx = 0, ty = 0] = nums().slice(-2);
        if (op === "TD") leading = -ty;
        lm = [lm[0]!, lm[1]!, lm[2]!, lm[3]!, lm[4]! + tx * lm[0]! + ty * lm[2]!, lm[5]! + tx * lm[1]! + ty * lm[3]!];
        tm = [...lm];
        break;
      }
      case "T*":
        lm = [lm[0]!, lm[1]!, lm[2]!, lm[3]!, lm[4]! - (leading || fontSize * 1.2) * lm[2]!, lm[5]! - (leading || fontSize * 1.2) * lm[3]!];
        tm = [...lm];
        break;
      case "Tj":
      case "'":
      case '"': {
        if (op !== "Tj") {
          lm = [lm[0]!, lm[1]!, lm[2]!, lm[3]!, lm[4]!, lm[5]! - (leading || fontSize * 1.2) * lm[3]!];
          tm = [...lm];
        }
        const s = [...stack].reverse().find((v) => typeof v === "object" && !Array.isArray(v)) as { str: string } | undefined;
        if (s) push(s.str);
        break;
      }
      case "TJ": {
        const arr = [...stack].reverse().find(Array.isArray) as (number | { str: string })[] | undefined;
        if (arr) push(arr.map((part) => (typeof part === "number" ? (part < -200 ? " " : "") : part.str)).join(""));
        break;
      }
    }
    stack.length = 0;
  }
}

/** Linhas visuais do PDF (mesmo agrupamento por posição vertical do site real). */
export async function simplePdfLines(bytes: Uint8Array): Promise<string[]> {
  const items: Item[] = [];
  for (const content of await contentStreams(bytes)) {
    if (!/\bBT\b/.test(content)) continue;
    parseContent(content, items);
  }
  const rows = new Map<number, Item[]>();
  for (const item of items) {
    const y = Math.round(item.y / 2) * 2;
    rows.set(y, [...(rows.get(y) ?? []), item]);
  }
  const lines: string[] = [];
  for (const y of [...rows.keys()].sort((a, b) => b - a)) {
    const text = rows
      .get(y)!
      .sort((a, b) => a.x - b.x || a.order - b.order)
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push(text);
  }
  return lines;
}

/** O texto parece legível? (fontes com codificação própria geram só símbolos). */
export function looksReadable(lines: string[]): boolean {
  const text = lines.join(" ");
  const letters = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const words = (text.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []).length;
  return letters >= 12 && words >= 3;
}
