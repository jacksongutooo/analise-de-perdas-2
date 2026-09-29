// Configuração lida das variáveis de ambiente (uso exclusivo no servidor).
import { parseMoneyToCents } from "./format";

function bool(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function price(value: string | undefined): number | null {
  const cents = parseMoneyToCents((value ?? "").trim());
  return cents !== null && cents > 0 ? cents : null;
}

/** URL base da API do gateway: https (http só para um servidor de testes na própria máquina). */
function apiBaseUrl(value: string | undefined, fallback: string): string {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) return raw;
  } catch {
    /* inválida: usa o endereço oficial */
  }
  console.error("[env] BLACKCAT_BASE_URL inválida (use https): usando o endereço oficial da API.");
  return fallback;
}

export const config = {
  demoMode: bool(process.env.DEMO_MODE),
  reviewDays: int(process.env.REVIEW_DAYS, 15, 1, 90),
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 4, 1, 100),
  maxFilesPerCase: int(process.env.MAX_FILES_PER_CASE, 40, 1, 200),
  draftTtlDays: int(process.env.DRAFT_TTL_DAYS, 7, 1, 30),
  storageDriver: (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase() === "s3" ? ("s3" as const) : ("local" as const),
  storageLocalDir: process.env.STORAGE_LOCAL_DIR?.trim() || ".storage",
  s3: {
    bucket: process.env.S3_BUCKET?.trim() ?? "",
    region: process.env.S3_REGION?.trim() || "auto",
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() ?? "",
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE),
  },
  cronSecret: process.env.CRON_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** Ano de referência do ComprovaBet exigido no envio (documento anual). */
  comprovabetYear: int(process.env.COMPROVABET_YEAR, 2025, 2020, 2100),
  /** Valor da análise, cobrado no PIX (definido só aqui, no servidor). */
  analysisPriceCents: price(process.env.ANALYSIS_PRICE),
  /**
   * Gateway de pagamento: BlackCat (PIX). A chave fica só no servidor (nunca em variável NEXT_PUBLIC_).
   * Sem chave, o pagamento só existe na demonstração (DEMO_MODE).
   */
  blackcat: {
    apiKey: process.env.BLACKCAT_API_KEY?.trim() ?? "",
    baseUrl: apiBaseUrl(process.env.BLACKCAT_BASE_URL, "https://api.blackcatoficial.com/api"),
  },
};

export function maxUploadBytes(): number {
  return config.maxUploadMb * 1024 * 1024;
}

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET ausente ou curto demais (mínimo de 32 caracteres). Configure o arquivo .env.");
  }
  return secret;
}
