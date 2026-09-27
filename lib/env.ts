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

function httpsUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/\{protocolo\}/g, "PROTOCOLO"));
    return url.protocol === "https:" || (url.protocol === "http:" && process.env.NODE_ENV !== "production") ? raw : null;
  } catch {
    return null;
  }
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
  /** Valor da análise exibido na etapa de pagamento (opcional). */
  analysisPriceCents: price(process.env.ANALYSIS_PRICE),
  /** Link de pagamento externo (opcional). "{protocolo}" é trocado pelo protocolo do caso. */
  paymentUrl: httpsUrl(process.env.PAYMENT_URL),
  /** Gateway de pagamento (Mercado Pago). Sem token: pagamento só na demonstração (DEMO_MODE). */
  mercadoPago: {
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "",
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() ?? "",
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

/** Link de pagamento do caso, quando configurado. */
export function paymentLinkFor(protocol: string): string | null {
  return config.paymentUrl ? config.paymentUrl.replace(/\{protocolo\}/g, encodeURIComponent(protocol)) : null;
}
