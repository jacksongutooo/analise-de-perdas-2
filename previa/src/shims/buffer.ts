// Buffer mínimo para o navegador: só o que o código do servidor usa (from, alloc, concat, toString,
// includes/indexOf, subarray, equals). Subclasse de Uint8Array, como no Node.

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8");

function latin1ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return out;
}

function base64ToBytes(text: string): Uint8Array {
  let clean = text.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  while (clean.length % 4) clean += "=";
  return latin1ToBytes(atob(clean));
}

function hexToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function encode(text: string, encoding = "utf8"): Uint8Array {
  switch (encoding.toLowerCase()) {
    case "utf8":
    case "utf-8":
      return utf8Encoder.encode(text);
    case "latin1":
    case "binary":
    case "ascii":
      return latin1ToBytes(text);
    case "base64":
    case "base64url":
      return base64ToBytes(text);
    case "hex":
      return hexToBytes(text);
    default:
      throw new TypeError(`Codificação não suportada na prévia: ${encoding}`);
  }
}

// Base sem as assinaturas estáticas do Uint8Array (Buffer.from tem outra assinatura, como no Node).
const Uint8ArrayBase = Uint8Array as unknown as { new (...args: any[]): Uint8Array; prototype: Uint8Array };

export class Buffer extends Uint8ArrayBase {
  static from(value: unknown, encodingOrOffset?: string | number, length?: number): Buffer {
    if (typeof value === "string") return Buffer.wrap(encode(value, typeof encodingOrOffset === "string" ? encodingOrOffset : "utf8"));
    if (value instanceof ArrayBuffer) {
      const offset = typeof encodingOrOffset === "number" ? encodingOrOffset : 0;
      return new Buffer(value, offset, length ?? value.byteLength - offset);
    }
    if (ArrayBuffer.isView(value)) {
      const copy = new Buffer(value.byteLength);
      copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return copy;
    }
    if (Array.isArray(value)) {
      const copy = new Buffer(value.length);
      copy.set(value as number[]);
      return copy;
    }
    throw new TypeError("Buffer.from: tipo não suportado na prévia.");
  }

  /** Mesmo conteúdo, sem cópia. */
  static wrap(bytes: Uint8Array): Buffer {
    return new Buffer(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  }

  static alloc(size: number, fill?: number): Buffer {
    const b = new Buffer(size);
    if (fill) b.fill(fill);
    return b;
  }

  static allocUnsafe(size: number): Buffer {
    return new Buffer(size);
  }

  static concat(list: Uint8Array[], total?: number): Buffer {
    const size = total ?? list.reduce((acc, b) => acc + b.length, 0);
    const out = new Buffer(size);
    let offset = 0;
    for (const b of list) {
      if (offset >= size) break;
      out.set(b.subarray(0, size - offset), offset);
      offset += b.length;
    }
    return out;
  }

  static isBuffer(value: unknown): value is Buffer {
    return value instanceof Buffer;
  }

  static byteLength(value: string | Uint8Array, encoding?: string): number {
    return typeof value === "string" ? encode(value, encoding).length : value.byteLength;
  }

  toString(encoding = "utf8", start = 0, end = this.length): string {
    const view = this.subarray(start, end);
    switch (encoding.toLowerCase()) {
      case "utf8":
      case "utf-8":
        return utf8Decoder.decode(view);
      case "latin1":
      case "binary":
        return bytesToLatin1(view);
      case "ascii":
        return bytesToLatin1(view).replace(/[\u0080-ÿ]/g, (c) => String.fromCharCode(c.charCodeAt(0) & 0x7f));
      case "base64":
        return btoa(bytesToLatin1(view));
      case "base64url":
        return btoa(bytesToLatin1(view)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      case "hex":
        return Array.from(view, (b) => b.toString(16).padStart(2, "0")).join("");
      default:
        throw new TypeError(`Codificação não suportada na prévia: ${encoding}`);
    }
  }

  indexOf(value: number | string | Uint8Array, byteOffset = 0, encoding?: string): number {
    if (typeof value === "number") return super.indexOf(value, byteOffset);
    const needle = typeof value === "string" ? encode(value, encoding ?? "utf8") : value;
    if (!needle.length) return byteOffset <= this.length ? byteOffset : -1;
    const first = needle[0];
    outer: for (let i = Math.max(0, byteOffset); i <= this.length - needle.length; i++) {
      if (this[i] !== first) continue;
      for (let j = 1; j < needle.length; j++) if (this[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  }

  includes(value: number | string | Uint8Array, byteOffset = 0, encoding?: string): boolean {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }

  equals(other: Uint8Array): boolean {
    if (other.length !== this.length) return false;
    for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
    return true;
  }

  readUInt32BE(offset = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(offset);
  }

  writeUInt32BE(value: number, offset = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint32(offset, value);
    return offset + 4;
  }

  toJSON() {
    return { type: "Buffer", data: Array.from(this) };
  }
}

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
