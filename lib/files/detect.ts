// Validação do conteúdo real do arquivo (assinatura/"magic bytes"), não apenas da extensão.

export type AllowedKind = "pdf" | "png" | "jpeg" | "xlsx" | "csv";

export const ALLOWED_EXTENSIONS: Record<string, AllowedKind> = {
  pdf: "pdf",
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  xlsx: "xlsx",
  csv: "csv",
};

export const MIME_BY_KIND: Record<AllowedKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

const EXECUTABLE_SIGNATURES: number[][] = [
  [0x4d, 0x5a], // MZ (Windows)
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O / Java class
  [0x23, 0x21], // #! script
];

function startsWith(buf: Buffer, signature: number[]): boolean {
  return signature.every((byte, i) => buf[i] === byte);
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) control++;
  }
  if (control > sample.length * 0.01) return false;
  const text = sample.toString("latin1").toLowerCase();
  return !/<\s*(script|html|iframe|svg|object|embed)\b/.test(text);
}

export type DetectResult = { ok: true; kind: AllowedKind; mime: string } | { ok: false; error: string };

export function detectFileType(buf: Buffer, extension: string): DetectResult {
  const expected = ALLOWED_EXTENSIONS[extension];
  if (!expected) return { ok: false, error: "Formato não aceito. Envie PDF, CSV, XLSX, JPG ou PNG." };
  if (buf.length === 0) return { ok: false, error: "O arquivo está vazio." };
  if (EXECUTABLE_SIGNATURES.some((sig) => startsWith(buf, sig))) {
    return { ok: false, error: "Arquivos executáveis não são permitidos." };
  }

  let kind: AllowedKind | null = null;
  if (buf.subarray(0, 1024).includes("%PDF-", 0, "latin1")) kind = "pdf";
  else if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) kind = "png";
  else if (startsWith(buf, [0xff, 0xd8, 0xff])) kind = "jpeg";
  else if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    const head = buf.subarray(0, Math.min(buf.length, 4_000_000));
    if (head.includes("vbaProject.bin", 0, "latin1")) return { ok: false, error: "Planilhas com macros não são aceitas." };
    if (head.includes("xl/", 0, "latin1")) kind = "xlsx";
  } else if (looksLikeText(buf)) kind = "csv";

  if (!kind) return { ok: false, error: "Não foi possível reconhecer o arquivo. Envie PDF, CSV, XLSX, JPG ou PNG." };
  if (kind !== expected) return { ok: false, error: "O conteúdo do arquivo não corresponde à extensão." };
  return { ok: true, kind, mime: MIME_BY_KIND[kind] };
}
