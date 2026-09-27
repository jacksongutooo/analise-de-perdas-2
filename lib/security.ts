import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

type ScryptParams = { N: number; r: number; p: number };
const SCRYPT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };

function deriveKey(password: string, salt: Buffer, length: number, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, { ...params, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Hash de senha com scrypt (nativo do Node, sem dependências). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, 64, SCRYPT_PARAMS);
  return ["scrypt", SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key ?? "", "base64");
  if (!expected.length) return false;
  try {
    const actual = await deriveKey(password, Buffer.from(salt ?? "", "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

type HeaderReader = { get(name: string): string | null };

export function clientIp(headers: HeaderReader): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : headers.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : null;
}

export function userAgent(headers: HeaderReader): string | null {
  return headers.get("user-agent")?.slice(0, 300) ?? null;
}

/** Rejeita requisições de escrita vindas de outra origem (defesa extra contra CSRF). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
