import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import { fromMercadoPago, mapMercadoPagoStatus, mercadoPagoProvider, verifyMercadoPagoSignature } from "@/lib/payments/mercadopago";
import { paymentMethodLabel } from "@/lib/payments/types";

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };

function fakeFetch(responses: unknown[], status = 200) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init as Call["init"] });
    const body = responses.shift() ?? {};
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetcher };
}

const checkoutInput = {
  paymentId: "pay_123",
  amountCents: 9700,
  description: "Análise documental de perdas em apostas",
  payer: { name: "Ana Souza", email: "ana@exemplo.com.br" },
  returnUrl: "https://site.exemplo/analise?pagamento=retorno",
  notificationUrl: "https://site.exemplo/api/payments/webhook/mercadopago",
};

describe("Mercado Pago", () => {
  test("status do Mercado Pago → status do pagamento", () => {
    assert.equal(mapMercadoPagoStatus("approved"), "approved");
    assert.equal(mapMercadoPagoStatus("rejected"), "rejected");
    assert.equal(mapMercadoPagoStatus("cancelled"), "cancelled");
    assert.equal(mapMercadoPagoStatus("refunded"), "refunded");
    assert.equal(mapMercadoPagoStatus("charged_back"), "refunded");
    // Em análise, autorizado ou desconhecido: continua pendente (nunca aprova por engano).
    for (const s of ["in_process", "pending", "authorized", "in_mediation", "", null, undefined]) assert.equal(mapMercadoPagoStatus(s), "pending");
  });

  test("conversão do pagamento (Pix e cartão, valor em centavos)", () => {
    const pix = fromMercadoPago({
      id: 998877,
      status: "approved",
      status_detail: "accredited",
      payment_method_id: "pix",
      payment_type_id: "bank_transfer",
      date_approved: "2026-09-25T15:04:05.000-03:00",
      transaction_amount: 97,
      external_reference: "pay_123",
    });
    assert.equal(pix.providerPaymentId, "998877");
    assert.equal(pix.method, "pix");
    assert.equal(pix.amountCents, 9700);
    assert.equal(pix.reference, "pay_123");
    assert.equal(pix.paidAt?.toISOString(), "2026-09-25T18:04:05.000Z");
    const card = fromMercadoPago({ id: "1", status: "rejected", payment_method_id: "visa", payment_type_id: "credit_card", transaction_amount: 96.999 });
    assert.equal(card.method, "credit_card");
    assert.equal(card.status, "rejected");
    assert.equal(card.amountCents, 9700);
    assert.equal(card.paidAt, null);
    assert.equal(paymentMethodLabel("pix"), "Pix");
    assert.equal(paymentMethodLabel("credit_card"), "Cartão de crédito");
    assert.equal(paymentMethodLabel(null), "—");
  });

  test("assinatura das notificações (x-signature)", () => {
    const secret = "chave-secreta-de-teste";
    const ts = "1758826800";
    const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");
    const v1 = sign(`id:123456;request-id:req-1;ts:${ts};`);
    assert.equal(verifyMercadoPagoSignature({ secret, signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456" }), true);
    // Espaços no cabeçalho são aceitos.
    assert.equal(verifyMercadoPagoSignature({ secret, signature: `ts=${ts}, v1=${v1}`, requestId: "req-1", dataId: "123456" }), true);
    // Qualquer alteração invalida.
    assert.equal(verifyMercadoPagoSignature({ secret, signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "654321" }), false);
    assert.equal(verifyMercadoPagoSignature({ secret, signature: `ts=${ts},v1=${v1}`, requestId: "outro", dataId: "123456" }), false);
    assert.equal(verifyMercadoPagoSignature({ secret: "outra-chave", signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456" }), false);
    assert.equal(verifyMercadoPagoSignature({ secret, signature: null, requestId: "req-1", dataId: "123456" }), false);
    assert.equal(verifyMercadoPagoSignature({ secret, signature: `v1=${v1}`, requestId: "req-1", dataId: "123456" }), false);
    assert.equal(verifyMercadoPagoSignature({ secret: "", signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456" }), false);
    // Id alfanumérico entra em minúsculas no manifesto.
    const alnum = sign(`id:abc123;request-id:req-2;ts:${ts};`);
    assert.equal(verifyMercadoPagoSignature({ secret, signature: `ts=${ts},v1=${alnum}`, requestId: "req-2", dataId: "ABC123" }), true);
  });

  test("checkout: preferência com valor, referência, retorno, notificação e só Pix/cartão", async () => {
    const { calls, fetcher } = fakeFetch([
      { id: "pref-1", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1", sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1" },
    ]);
    const mp = mercadoPagoProvider("APP_USR-token-de-producao", fetcher);
    const out = await mp.createCheckout(checkoutInput);
    assert.deepEqual(out, { checkoutId: "pref-1", checkoutUrl: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1" });
    const call = calls[0]!;
    assert.equal(call.url, "https://api.mercadopago.com/checkout/preferences");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.Authorization, "Bearer APP_USR-token-de-producao");
    assert.equal(call.init.headers["X-Idempotency-Key"], "pay_123");
    const body = JSON.parse(String(call.init.body));
    assert.equal(body.items[0].unit_price, 97);
    assert.equal(body.items[0].currency_id, "BRL");
    assert.equal(body.items[0].quantity, 1);
    assert.equal(body.external_reference, "pay_123");
    assert.equal(body.auto_return, "approved");
    assert.equal(body.back_urls.success, checkoutInput.returnUrl);
    assert.equal(body.notification_url, checkoutInput.notificationUrl);
    assert.deepEqual(body.payment_methods.excluded_payment_types, [{ id: "ticket" }, { id: "atm" }]);
    assert.equal(body.payer.email, "ana@exemplo.com.br");
  });

  test("checkout: credenciais de teste usam o ambiente de testes; sem endereço público, sem notificação", async () => {
    const { calls, fetcher } = fakeFetch([{ id: "pref-2", init_point: "https://prod/x", sandbox_init_point: "https://sandbox/x" }]);
    const mp = mercadoPagoProvider("TEST-123", fetcher);
    const out = await mp.createCheckout({ ...checkoutInput, notificationUrl: null });
    assert.equal(out.checkoutUrl, "https://sandbox/x");
    assert.ok(!("notification_url" in JSON.parse(String(calls[0]!.init.body))));
  });

  test("consulta por referência prefere o pagamento aprovado", async () => {
    const { calls, fetcher } = fakeFetch([
      {
        results: [
          { id: 2, status: "rejected", payment_method_id: "visa", payment_type_id: "credit_card", transaction_amount: 97, external_reference: "pay_123" },
          { id: 1, status: "approved", payment_method_id: "pix", transaction_amount: 97, date_approved: "2026-09-25T15:00:00Z", external_reference: "pay_123" },
        ],
      },
      { results: [] },
    ]);
    const mp = mercadoPagoProvider("APP_USR-x", fetcher);
    const found = await mp.findByReference("pay_123");
    assert.equal(found?.providerPaymentId, "1");
    assert.equal(found?.status, "approved");
    assert.ok(calls[0]!.url.startsWith("https://api.mercadopago.com/v1/payments/search?external_reference=pay_123"));
    assert.equal(await mp.findByReference("pay_999"), null);
  });

  test("erro da API vira exceção sem expor o token", async () => {
    const { fetcher } = fakeFetch([{ message: "invalid" }], 401);
    const mp = mercadoPagoProvider("APP_USR-segredo", fetcher);
    await assert.rejects(mp.getPayment("123"), (error: Error) => {
      assert.ok(error.message.includes("401"));
      assert.ok(!error.message.includes("APP_USR-segredo"));
      return true;
    });
  });
});
