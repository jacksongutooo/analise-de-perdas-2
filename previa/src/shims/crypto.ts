// node:crypto para a prévia: SHA-256/HMAC síncronos em JS, números aleatórios do navegador e um
// "scrypt" simplificado (a prévia não guarda senhas reais: só o acesso de demonstração).
import { Buffer } from "./buffer";

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const length = data.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (hh! + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d! + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0]! + a!) | 0;
    h[1] = (h[1]! + b!) | 0;
    h[2] = (h[2]! + c!) | 0;
    h[3] = (h[3]! + d!) | 0;
    h[4] = (h[4]! + e!) | 0;
    h[5] = (h[5]! + f!) | 0;
    h[6] = (h[6]! + g!) | 0;
    h[7] = (h[7]! + hh!) | 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!);
  return out;
}

function toBytes(data: string | Uint8Array, encoding?: string): Uint8Array {
  return typeof data === "string" ? Buffer.from(data, encoding ?? "utf8") : data;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  let k = key.length > 64 ? sha256(key) : key;
  const block = new Uint8Array(64);
  block.set(k);
  k = block;
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    inner[i] = k[i]! ^ 0x36;
    outer[i] = k[i]! ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

class Digest {
  private chunks: Uint8Array[] = [];
  constructor(private readonly finish: (data: Uint8Array) => Uint8Array) {}
  update(data: string | Uint8Array, encoding?: string) {
    this.chunks.push(toBytes(data, encoding));
    return this;
  }
  digest(encoding?: string): Buffer | string {
    const out = Buffer.from(this.finish(Buffer.concat(this.chunks)));
    return encoding ? out.toString(encoding) : out;
  }
}

function assertSha256(algorithm: string) {
  if (algorithm.toLowerCase() !== "sha256") throw new Error(`Algoritmo não suportado na prévia: ${algorithm}`);
}

export function createHash(algorithm: string) {
  assertSha256(algorithm);
  return new Digest(sha256);
}

export function createHmac(algorithm: string, key: string | Uint8Array) {
  assertSha256(algorithm);
  const k = toBytes(key);
  return new Digest((data) => hmacSha256(k, data));
}

export function randomBytes(size: number): Buffer {
  const out = new Buffer(size);
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(size, i + 65536)));
  return out;
}

export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomInt(min: number, max?: number): number {
  const [lo, hi] = max === undefined ? [0, min] : [min, max];
  const range = hi - lo;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return lo + (values[0]! % range);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError("Input buffers must have the same byte length");
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Derivação simplificada (HMAC-SHA256 iterado). Só para a prévia: o site real usa o scrypt do Node. */
export function scrypt(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  keylen: number,
  options: unknown,
  callback?: (err: Error | null, key: Buffer) => void,
) {
  const cb = (typeof options === "function" ? options : callback) as (err: Error | null, key: Buffer) => void;
  setTimeout(() => {
    const pass = toBytes(password);
    const s = toBytes(salt);
    const out = new Buffer(keylen);
    for (let block = 0, offset = 0; offset < keylen; block++, offset += 32) {
      let u = hmacSha256(pass, Buffer.concat([s, Buffer.from([0, 0, 0, block + 1])]));
      const acc = Uint8Array.from(u);
      for (let i = 1; i < 256; i++) {
        u = hmacSha256(pass, u);
        for (let j = 0; j < 32; j++) acc[j] = acc[j]! ^ u[j]!;
      }
      out.set(acc.subarray(0, Math.min(32, keylen - offset)), offset);
    }
    cb(null, out);
  }, 0);
}

export default { createHash, createHmac, randomBytes, randomUUID, randomInt, timingSafeEqual, scrypt };
