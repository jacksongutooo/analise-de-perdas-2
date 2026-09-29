// BlackCat (documentação: https://docs.blackcatoficial.com): cobrança PIX pela API, com confirmação pela
// notificação transaction.paid (webhook), sempre conferida na consulta de status da transação.
// A chave (cabeçalho X-API-Key) fica só no servidor: nunca vai para o navegador nem para os logs.
import { redactCpf } from "@/lib/cpf";
import type { PaymentProviderAdapter, PaymentStatusValue, PixChargeInput, ProviderTransaction } from "./types";

export const BLACKCAT_DEFAULT_BASE_URL = "https://api.blackcatoficial.com/api";

const CREATE_TIMEOUT_MS = 20_000;
const STATUS_TIMEOUT_MS = 10_000;

/** Erro técnico da integração (vai para o log do servidor; o cliente vê só uma mensagem amigável). */
export class BlackCatError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "BlackCatError";
    this.status = status;
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
};
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Só os campos listados, sem valores vazios (auditoria sem dados do cliente). */
const pick = (source: Json, keys: string[]): Json =>
  Object.fromEntries(keys.filter((k) => source[k] !== undefined && source[k] !== null && source[k] !== "").map((k) => [k, source[k]]));

/** Status da BlackCat → status interno. Desconhecido continua pendente (nunca aprova por engano). */
export function mapBlackCatStatus(status: unknown): PaymentStatusValue {
  switch ((str(status) ?? "").toUpperCase()) {
    case "PAID":
      return "paid";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "REFUNDED":
      return "refunded";
    case "EXPIRED":
      return "expired";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

/** Texto do PIX (padrão EMV do Banco Central: começa com "000201"). */
function pixText(value: unknown): string | null {
  const s = str(value);
  return s && /^000201/.test(s) ? s : null;
}

/**
 * Imagem do QR Code devolvida pela API: data URI de imagem ou base64 puro de PNG/JPEG. Quando o campo traz o
 * próprio texto do PIX (e não uma imagem), devolve null e o QR Code é desenhado a partir do copia e cola.
 */
export function qrImageFrom(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const compact = s.replace(/\s+/g, "");
  if (compact.length > 400_000) return null;
  const uri = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(compact);
  if (uri) return `data:image/${uri[1]!.toLowerCase()};base64,${uri[2]}`;
  if (/^iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/.test(compact)) return `data:image/png;base64,${compact}`;
  if (/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(compact)) return `data:image/jpeg;base64,${compact}`;
  return null;
}

/** Corpo da criação da venda PIX (POST /sales/create-sale). Valores em centavos. */
export function createSaleBody(input: PixChargeInput) {
  return {
    amount: input.amountCents,
    currency: "BRL",
    paymentMethod: "pix",
    items: [{ title: input.title, quantity: 1, unitPrice: input.amountCents, tangible: false }],
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      phone: input.customer.phone,
      document: { number: input.customer.cpf, type: "cpf" },
    },
    pix: { expiresInDays: input.expiresInDays },
    ...(input.postbackUrl ? { postbackUrl: input.postbackUrl } : {}),
    externalRef: input.externalRef,
  };
}

/** Os dados da transação: a API responde { success, data: {...} }. */
function payloadData(body: unknown): Json | null {
  const root = obj(body);
  if (!root) return null;
  return obj(root.data) ?? (root.transactionId !== undefined ? root : null);
}

export function blackCatProvider(opts: { apiKey: string; baseUrl?: string; fetcher?: typeof fetch }): PaymentProviderAdapter {
  const baseUrl = (opts.baseUrl || BLACKCAT_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetcher = opts.fetcher ?? fetch;

  /** Mensagem de erro da API para o log: curta, sem CPF e sem a chave. */
  const safe = (text: string) => redactCpf(opts.apiKey ? text.split(opts.apiKey).join("***") : text).slice(0, 300);

  async function call(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number }) {
    let res: Response;
    try {
      res = await fetcher(`${baseUrl}${path}`, {
        method: init.method,
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": opts.apiKey },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "tempo de resposta esgotado" : "falha de conexão";
      throw new BlackCatError(`BlackCat indisponível em ${path.split("?")[0]}: ${reason}`);
    }
    const text = await res.text().catch(() => "");
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { res, body };
  }

  function apiMessage(body: unknown): string {
    const root = obj(body);
    return safe(str(root?.message) ?? str(root?.error) ?? str(obj(root?.error)?.message) ?? "sem detalhes");
  }

  return {
    id: "blackcat",
    label: "BlackCat",

    async createPixCharge(input) {
      const { res, body } = await call("/sales/create-sale", { method: "POST", body: createSaleBody(input), timeoutMs: CREATE_TIMEOUT_MS });
      if (!res.ok || obj(body)?.success === false) {
        throw new BlackCatError(`BlackCat recusou a criação do PIX (HTTP ${res.status}): ${apiMessage(body)}`, res.status);
      }
      const data = payloadData(body);
      const transactionId = str(data?.transactionId);
      if (!data || !transactionId) throw new BlackCatError(`Resposta da BlackCat sem transactionId (HTTP ${res.status}).`, res.status);
      const paymentData = obj(data.paymentData) ?? {};
      // Código copia e cola: "copyPaste"; "qrCode" traz o mesmo texto do PIX.
      const copyPaste = str(paymentData.copyPaste) ?? pixText(paymentData.qrCode) ?? pixText(paymentData.qrCodeBase64);
      if (!copyPaste || copyPaste.length > 2_000 || /[^\x20-\x7E]/.test(copyPaste)) {
        throw new BlackCatError(`Resposta da BlackCat sem o código PIX (transação ${transactionId}).`, res.status);
      }
      return {
        transactionId,
        status: mapBlackCatStatus(data.status),
        providerStatus: str(data.status),
        amountCents: num(data.amount),
        copyPaste,
        qrCodeImage: qrImageFrom(paymentData.qrCodeBase64),
        expiresAt: date(paymentData.expiresAt),
        audit: {
          ...pick(data, ["transactionId", "status", "paymentMethod", "amount", "netAmount", "fees", "createdAt"]),
          ...pick(paymentData, ["expiresAt"]),
        },
      };
    },

    async getTransaction(transactionId): Promise<ProviderTransaction | null> {
      const { res, body } = await call(`/sales/${encodeURIComponent(transactionId)}/status`, { method: "GET", timeoutMs: STATUS_TIMEOUT_MS });
      if (res.status === 404) return null;
      if (!res.ok || obj(body)?.success === false) {
        throw new BlackCatError(`BlackCat recusou a consulta da transação (HTTP ${res.status}): ${apiMessage(body)}`, res.status);
      }
      const data = payloadData(body);
      if (!data) throw new BlackCatError(`Resposta da BlackCat sem os dados da transação (HTTP ${res.status}).`, res.status);
      const returnedId = str(data.transactionId);
      if (returnedId && returnedId !== transactionId) throw new BlackCatError("A BlackCat devolveu outra transação na consulta de status.");
      return {
        transactionId,
        status: mapBlackCatStatus(data.status),
        providerStatus: str(data.status),
        paymentMethod: str(data.paymentMethod)?.toLowerCase() ?? null,
        amountCents: num(data.amount),
        paidAt: date(data.paidAt),
        audit: pick(data, ["transactionId", "status", "paymentMethod", "amount", "netAmount", "fees", "paidAt", "endToEndId"]),
      };
    },
  };
}

export type BlackCatNotification = {
  event: string;
  transactionId: string;
  externalReference: string | null;
  status: string | null;
  /** Conteúdo guardado para auditoria: sem os dados do cliente (nome, CPF, contato) e sem UTM. */
  audit: Record<string, unknown>;
};

/**
 * Lê a notificação (webhook) da BlackCat: evento (ex.: transaction.paid), transactionId, externalReference e
 * status. Os campos podem vir na raiz ou dentro de "data". O conteúdo NÃO confirma pagamento: a confirmação é
 * sempre consultada na API.
 */
export function parseBlackCatNotification(payload: unknown): BlackCatNotification | null {
  const root = obj(payload);
  if (!root) return null;
  const data = obj(root.data) ?? root;
  const event = str(root.event) ?? str(data.event);
  const transactionId = str(data.transactionId) ?? str(root.transactionId);
  if (!event || !transactionId || event.length > 80 || transactionId.length > 120) return null;
  const fields = ["transactionId", "externalReference", "status", "amount", "netAmount", "fees", "paymentMethod", "paidAt"];
  return {
    event,
    transactionId,
    externalReference: str(data.externalReference) ?? str(root.externalReference),
    status: str(data.status) ?? str(root.status),
    audit: { event, ...pick(root, ["timestamp"]), ...pick(data, fields) },
  };
}
