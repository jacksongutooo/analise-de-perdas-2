// Mercado Pago (Checkout Pro): o cliente paga com Pix ou cartão na página do Mercado Pago, que avisa o site
// por notificação (webhook). O site nunca recebe dados de cartão. Documentação: https://www.mercadopago.com.br/developers
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security";
import type { PaymentProviderAdapter, PaymentStatusValue, ProviderPayment } from "./types";

const API = "https://api.mercadopago.com";

/** Status do Mercado Pago → status do nosso registro. "in_process", "authorized" etc. seguem pendentes. */
export function mapMercadoPagoStatus(status: string | null | undefined): PaymentStatusValue {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending";
  }
}

type MercadoPagoPayment = {
  id: number | string;
  status?: string;
  status_detail?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string | null;
  transaction_amount?: number;
  external_reference?: string | null;
};

export function fromMercadoPago(p: MercadoPagoPayment): ProviderPayment {
  const method = p.payment_method_id === "pix" ? "pix" : (p.payment_type_id ?? p.payment_method_id ?? null);
  return {
    providerPaymentId: String(p.id),
    status: mapMercadoPagoStatus(p.status),
    statusDetail: p.status_detail ?? null,
    method,
    paidAt: p.date_approved ? new Date(p.date_approved) : null,
    amountCents: typeof p.transaction_amount === "number" ? Math.round(p.transaction_amount * 100) : null,
    reference: p.external_reference ?? null,
  };
}

/**
 * Confere a assinatura das notificações (cabeçalho x-signature: "ts=...,v1=...").
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com HMAC-SHA256 da chave secreta do webhook.
 */
export function verifyMercadoPagoSignature(input: { secret: string; signature: string | null; requestId: string | null; dataId: string | null }): boolean {
  if (!input.secret || !input.signature) return false;
  const parts = Object.fromEntries(
    input.signature.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim() ?? "", rest.join("=").trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  let manifest = "";
  if (input.dataId) manifest += `id:${/^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return safeEqual(expected, v1);
}

export function mercadoPagoProvider(accessToken: string, fetcher: typeof fetch = fetch): PaymentProviderAdapter {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetcher(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status} em ${path.split("?")[0]}`);
    return (await res.json()) as T;
  }
  return {
    id: "mercadopago",
    label: "Mercado Pago",
    async createCheckout(input) {
      const body = {
        items: [
          {
            id: "analise-documental",
            title: input.description,
            quantity: 1,
            unit_price: Math.round(input.amountCents) / 100,
            currency_id: "BRL",
          },
        ],
        payer: { name: input.payer.name, email: input.payer.email },
        external_reference: input.paymentId,
        back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
        auto_return: "approved",
        // Pix e cartão: boleto e lotérica demoram dias para compensar e ficam fora.
        payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], installments: 1 },
        statement_descriptor: "ANALISE DOCUMENTAL",
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      };
      const data = await call<{ id: string; init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "X-Idempotency-Key": input.paymentId },
      });
      // Credenciais de teste (TEST-...) usam o ambiente de testes do Mercado Pago.
      const checkoutUrl = accessToken.startsWith("TEST-") && data.sandbox_init_point ? data.sandbox_init_point : data.init_point;
      return { checkoutId: String(data.id), checkoutUrl };
    },
    async findByReference(reference) {
      const data = await call<{ results?: MercadoPagoPayment[] }>(
        `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`,
      );
      const results = data.results ?? [];
      const best = results.find((p) => p.status === "approved") ?? results[0];
      return best ? fromMercadoPago(best) : null;
    },
    async getPayment(providerPaymentId) {
      return fromMercadoPago(await call<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(providerPaymentId)}`));
    },
  };
}
