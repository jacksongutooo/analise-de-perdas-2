import { promises as fs } from "node:fs";
import path from "node:path";
import { authSecret, config } from "@/lib/env";
import { hmac } from "@/lib/security";
import type { StorageDriver } from "./types";

// Armazenamento em pasta privada FORA de /public. Os arquivos só são entregues pela
// rota /api/files, que exige sessão administrativa e assinatura válida e temporária.

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

export function localFileSignature(key: string, exp: number): string {
  return hmac(`file:${key}:${exp}`, authSecret());
}

function resolveKey(base: string, key: string): string {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Chave de arquivo inválida");
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Chave de arquivo inválida");
  return full;
}

export function createLocalStorage(): StorageDriver {
  const base = path.resolve(process.cwd(), config.storageLocalDir);
  return {
    async put(key, body) {
      const full = resolveKey(base, key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, body, { mode: 0o600 });
    },
    async get(key) {
      return fs.readFile(resolveKey(base, key));
    },
    async remove(key) {
      await fs.rm(resolveKey(base, key), { force: true });
    },
    async signedUrl(key, opts) {
      const exp = Date.now() + (opts.expiresInSeconds ?? 300) * 1000;
      const params = new URLSearchParams({ k: key, e: String(exp), s: localFileSignature(key, exp) });
      return `/api/files?${params.toString()}`;
    },
  };
}
