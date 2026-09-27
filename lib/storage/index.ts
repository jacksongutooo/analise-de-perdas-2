import { config } from "@/lib/env";
import type { StorageDriver } from "./types";

let driver: StorageDriver | null = null;

export async function getStorage(): Promise<StorageDriver> {
  if (driver) return driver;
  if (config.storageDriver === "s3") {
    const { createS3Storage } = await import("./s3");
    driver = createS3Storage();
  } else {
    if (process.env.VERCEL) {
      throw new Error("STORAGE_DRIVER=local não funciona na Vercel. Configure um bucket privado com STORAGE_DRIVER=s3.");
    }
    const { createLocalStorage } = await import("./local");
    driver = createLocalStorage();
  }
  return driver;
}

export type { StorageDriver, SignedUrlOptions } from "./types";
