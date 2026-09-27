// "@/lib/storage/local" na prévia: arquivos guardados no próprio navegador (IndexedDB, com memória
// como reserva). As chaves e o link temporário assinado seguem o mesmo formato do site real.
import { authSecret } from "@/lib/env";
import { hmac } from "@/lib/security";
import type { StorageDriver } from "@/lib/storage/types";
import { Buffer } from "./buffer";

const memory = new Map<string, Uint8Array>();
const DB_NAME = "previa-analise-arquivos";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return (dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

async function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const database = await openDb();
  if (!database) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(database.transaction("files", mode).objectStore("files"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function clearStoredFiles(): Promise<void> {
  memory.clear();
  await idb("readwrite", (store) => store.clear());
}

export function localFileSignature(key: string, exp: number): string {
  return hmac(`file:${key}:${exp}`, authSecret());
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

function checkKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Chave de arquivo inválida");
}

export function createLocalStorage(): StorageDriver {
  return {
    async put(key, body) {
      checkKey(key);
      const bytes = Uint8Array.from(body);
      memory.set(key, bytes);
      await idb("readwrite", (store) => store.put(bytes, key));
    },
    async get(key) {
      checkKey(key);
      const bytes = memory.get(key) ?? ((await idb("readonly", (store) => store.get(key))) as Uint8Array | undefined);
      if (!bytes) throw new Error("Arquivo indisponível nesta prévia (os arquivos ficam só neste navegador).");
      return Buffer.from(bytes) as unknown as globalThis.Buffer;
    },
    async remove(key) {
      checkKey(key);
      memory.delete(key);
      await idb("readwrite", (store) => store.delete(key));
    },
    async signedUrl(key, opts) {
      const exp = Date.now() + (opts.expiresInSeconds ?? 300) * 1000;
      const params = new URLSearchParams({ k: key, e: String(exp), s: localFileSignature(key, exp) });
      return `/api/files?${params.toString()}`;
    },
  };
}
