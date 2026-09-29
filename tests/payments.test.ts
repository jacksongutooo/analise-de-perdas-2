import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BlackCatError,
  blackCatProvider,
  createSaleBody,
  mapBlackCatStatus,
  parseBlackCatNotification,
  qrImageFrom,
} from "@/lib/payments/blackcat";
import { pixQrDataUri } from "@/lib/payments/qr";
import { paymentMethodLabel, providerLabel } from "@/lib/payments/types";

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init as Call["init"] });
    const next = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetcher };
}

const API_KEY = "bc_live_chave_de_teste_123";
const EMV = "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540597.005802BR5909BLACKCAT6009SAO PAULO62070503***6304ABCD";
const input = {
  externalRef: "AP-20260928-K7Q2M9XDPA",
  amountCents: 9700,
  title: "Serviço de análise documental",
  customer: { name: "Ana Souza", email: "ana@exemplo.com.br", phone: "11999999999", cpf: "52998224725" },
  postbackUrl: "https://site.exemplo/api/payments/webhook/blackcat",
  expiresInDays: 1,
};

// Resposta de criação no formato da documentação da BlackCat.
const saleResponse = {
  success: true,
  data: {
    transactionId: "TXN-1733654321-ABC123",
    status: "PENDING",
    paymentMethod: "pix",
    amount: 9700,
    netAmount: 9409,
    fees: 291,
    invoiceUrl: "https://blackcat.squarify.co/checkout/TXN-1733654321-ABC123",
    createdAt: "2026-09-28T13:30:00.000Z",
    paymentData: {
      qrCode: EMV,
      qrCodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      copyPaste: EMV,
      expiresAt: "2026-09-29T13:30:00.000Z",
    },
  },
};

describe("BlackCat: status", () => {
  test("status da BlackCat → status interno (desconhecido fica pendente)", () => {
    assert.equal(mapBlackCatStatus("PAID"), "paid");
    assert.equal(mapBlackCatStatus("paid"), "paid");
    assert.equal(mapBlackCatStatus("PENDING"), "pending");
    assert.equal(mapBlackCatStatus("CANCELLED"), "cancelled");
    assert.equal(mapBlackCatStatus("REFUNDED"), "refunded");
    assert.equal(mapBlackCatStatus("EXPIRED"), "expired");
    assert.equal(mapBlackCatStatus("FAILED"), "failed");
    for (const s of ["WAITING", "", null, undefined, 42]) assert.equal(mapBlackCatStatus(s), "pending");
  });
});

describe("BlackCat: criação do PIX", () => {
  test("corpo da venda: centavos, pix, serviço digital (tangible false), CPF e referência interna", () => {
    assert.deepEqual(createSaleBody(input), {
      amount: 9700,
      currency: "BRL",
      paymentMethod: "pix",
      items: [{ title: "Serviço de análise documental", quantity: 1, unitPrice: 9700, tangible: false }],
      customer: { name: "Ana Souza", email: "ana@exemplo.com.br", phone: "11999999999", document: { number: "52998224725", type: "cpf" } },
      pix: { expiresInDays: 1 },
      postbackUrl: "https://site.exemplo/api/payments/webhook/blackcat",
      externalRef: "AP-20260928-K7Q2M9XDPA",
    });
    // Sem endereço público (site sem https), a venda vai sem postbackUrl.
    assert.equal("postbackUrl" in createSaleBody({ ...input, postbackUrl: null }), false);
  });

  test("POST /sales/create-sale com X-API-Key e leitura da resposta oficial", async () => {
    const { calls, fetcher } = fakeFetch([{ body: saleResponse }]);
    const provider = blackCatProvider({ apiKey: API_KEY, baseUrl: "https://api.blackcatoficial.com/api/", fetcher });
    const charge = await provider.createPixCharge(input);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://api.blackcatoficial.com/api/sales/create-sale");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(calls[0]!.init.headers["X-API-Key"], API_KEY);
    assert.equal(calls[0]!.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), createSaleBody(input));

    assert.equal(charge.transactionId, "TXN-1733654321-ABC123");
    assert.equal(charge.status, "pending");
    assert.equal(charge.providerStatus, "PENDING");
    assert.equal(charge.amountCents, 9700);
    assert.equal(charge.copyPaste, EMV);
    assert.match(charge.qrCodeImage ?? "", /^data:image\/png;base64,iVBORw0KGgo/);
    assert.equal(charge.expiresAt?.toISOString(), "2026-09-29T13:30:00.000Z");
    // Auditoria sem dados do cliente.
    assert.deepEqual(Object.keys(charge.audit).sort(), ["amount", "createdAt", "expiresAt", "fees", "netAmount", "paymentMethod", "status", "transactionId"]);
    assert.ok(!JSON.stringify(charge.audit).includes("52998224725"));
  });

  test("qrCodeBase64 com o texto do PIX (e não uma imagem): QR desenhado a partir do copia e cola", async () => {
    const body = structuredClone(saleResponse);
    body.data.paymentData.qrCodeBase64 = EMV;
    const { fetcher } = fakeFetch([{ body }]);
    const charge = await blackCatProvider({ apiKey: API_KEY, fetcher }).createPixCharge(input);
    assert.equal(charge.qrCodeImage, null);
    assert.equal(charge.copyPaste, EMV);

    // Sem "copyPaste": o texto do PIX vem de "qrCode".
    const onlyQr = structuredClone(saleResponse) as { data: { paymentData: Record<string, unknown> } };
    delete onlyQr.data.paymentData.copyPaste;
    const second = await blackCatProvider({ apiKey: API_KEY, fetcher: fakeFetch([{ body: onlyQr }]).fetcher }).createPixCharge(input);
    assert.equal(second.copyPaste, EMV);
  });

  test("erro da BlackCat: erro técnico sem a chave e sem o CPF (para o log)", async () => {
    const { fetcher } = fakeFetch([{ status: 401, body: { success: false, message: `Chave ${API_KEY} inválida para o documento 529.982.247-25` } }]);
    await assert.rejects(blackCatProvider({ apiKey: API_KEY, fetcher }).createPixCharge(input), (error: unknown) => {
      assert.ok(error instanceof BlackCatError);
      assert.equal(error.status, 401);
      assert.match(error.message, /HTTP 401/);
      assert.ok(!error.message.includes(API_KEY));
      assert.ok(!error.message.includes("529.982.247-25"));
      return true;
    });
    // success: false com HTTP 200, e resposta sem o código PIX.
    await assert.rejects(
      blackCatProvider({ apiKey: API_KEY, fetcher: fakeFetch([{ body: { success: false, message: "Valor inválido" } }]).fetcher }).createPixCharge(input),
      /Valor inválido/,
    );
    const noCode = structuredClone(saleResponse) as { data: { paymentData: Record<string, unknown> } };
    noCode.data.paymentData = {};
    await assert.rejects(blackCatProvider({ apiKey: API_KEY, fetcher: fakeFetch([{ body: noCode }]).fetcher }).createPixCharge(input), /sem o código PIX/);
  });

  test("falha de conexão vira BlackCatError (sem detalhes da requisição)", async () => {
    const fetcher = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(blackCatProvider({ apiKey: API_KEY, fetcher }).createPixCharge(input), /BlackCat indisponível em \/sales\/create-sale: falha de conexão/);
  });
});

describe("BlackCat: consulta de status (confirmação real)", () => {
  test("GET /sales/{transactionId}/status", async () => {
    const { calls, fetcher } = fakeFetch([
      {
        body: {
          success: true,
          data: {
            transactionId: "TXN-1",
            status: "PAID",
            paymentMethod: "PIX",
            amount: 9700,
            netAmount: 9409,
            fees: 291,
            paidAt: "2026-09-28T13:35:00.000Z",
            endToEndId: "E1234567820260928133500000000001",
          },
        },
      },
    ]);
    const tx = await blackCatProvider({ apiKey: API_KEY, fetcher }).getTransaction("TXN-1");
    assert.equal(calls[0]!.url, "https://api.blackcatoficial.com/api/sales/TXN-1/status");
    assert.equal(calls[0]!.init.method, "GET");
    assert.equal(calls[0]!.init.headers["X-API-Key"], API_KEY);
    assert.equal(tx?.status, "paid");
    assert.equal(tx?.paymentMethod, "pix");
    assert.equal(tx?.amountCents, 9700);
    assert.equal(tx?.paidAt?.toISOString(), "2026-09-28T13:35:00.000Z");
    assert.equal(tx?.audit.endToEndId, "E1234567820260928133500000000001");
  });

  test("transação inexistente (404) e resposta de outra transação", async () => {
    assert.equal(await blackCatProvider({ apiKey: API_KEY, fetcher: fakeFetch([{ status: 404, body: { success: false } }]).fetcher }).getTransaction("TXN-X"), null);
    const other = fakeFetch([{ body: { success: true, data: { transactionId: "TXN-OUTRA", status: "PAID" } } }]);
    await assert.rejects(blackCatProvider({ apiKey: API_KEY, fetcher: other.fetcher }).getTransaction("TXN-1"), /outra transação/);
  });
});

describe("BlackCat: notificação (webhook)", () => {
  test("transaction.paid com os dados em data: evento, transactionId e referência; sem dados do cliente", () => {
    const n = parseBlackCatNotification({
      event: "transaction.paid",
      timestamp: "2026-09-28T13:35:01.000Z",
      data: {
        transactionId: "TXN-1",
        externalReference: "AP-20260928-K7Q2M9XDPA",
        status: "PAID",
        amount: 9700,
        paymentMethod: "pix",
        customer: { name: "Ana Souza", document: "52998224725", email: "ana@exemplo.com.br" },
        utm: { source: "instagram" },
      },
    });
    assert.equal(n?.event, "transaction.paid");
    assert.equal(n?.transactionId, "TXN-1");
    assert.equal(n?.externalReference, "AP-20260928-K7Q2M9XDPA");
    assert.equal(n?.status, "PAID");
    const audit = JSON.stringify(n?.audit);
    assert.ok(audit.includes("TXN-1") && audit.includes("2026-09-28T13:35:01.000Z"));
    assert.ok(!audit.includes("52998224725") && !audit.includes("Ana Souza") && !audit.includes("instagram"));
  });

  test("campos na raiz também são aceitos; sem evento ou transactionId, nada a processar", () => {
    assert.equal(parseBlackCatNotification({ event: "transaction.created", transactionId: "TXN-2", status: "PENDING" })?.transactionId, "TXN-2");
    assert.equal(parseBlackCatNotification({ transactionId: "TXN-2" }), null);
    assert.equal(parseBlackCatNotification({ event: "transaction.paid" }), null);
    assert.equal(parseBlackCatNotification("texto"), null);
    assert.equal(parseBlackCatNotification(null), null);
  });
});

describe("QR Code e rótulos", () => {
  test("imagem do QR Code: data URI ou base64 de PNG; texto do PIX não é imagem", () => {
    assert.equal(qrImageFrom("data:image/png;base64,iVBORw0KGgoAAAA="), "data:image/png;base64,iVBORw0KGgoAAAA=");
    assert.equal(qrImageFrom("iVBORw0KGgoAAAA="), "data:image/png;base64,iVBORw0KGgoAAAA=");
    assert.equal(qrImageFrom(EMV), null);
    assert.equal(qrImageFrom("data:image/svg+xml;base64,PHN2Zz4="), null);
    assert.equal(qrImageFrom("javascript:alert(1)"), null);
    assert.equal(qrImageFrom(null), null);
  });

  test("QR Code desenhado a partir do copia e cola (SVG)", () => {
    const uri = pixQrDataUri(EMV);
    assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/);
    const svg = decodeURIComponent(uri.split(",")[1]!);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
    assert.equal(pixQrDataUri(EMV), uri);
  });

  test("rótulos: PIX e gateways", () => {
    assert.equal(paymentMethodLabel("pix"), "PIX");
    assert.equal(paymentMethodLabel("PIX"), "PIX");
    assert.equal(paymentMethodLabel(null), "—");
    assert.equal(providerLabel("blackcat"), "BlackCat");
    assert.equal(providerLabel("demo"), "Pagamento de demonstração");
  });
});
