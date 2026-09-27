import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { applyProviderPayment, paymentProvider } from "@/lib/payments";
import { verifyMercadoPagoSignature } from "@/lib/payments/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Notificações do Mercado Pago. A assinatura é conferida com MERCADOPAGO_WEBHOOK_SECRET e o status é
 * sempre consultado na API do Mercado Pago (o conteúdo da notificação não é usado como prova de pagamento).
 * Sem a chave configurada, a notificação ainda é processada (a consulta à API é a prova), com um alerta no log:
 * assim um pagamento aprovado nunca fica sem a solicitação correspondente.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* algumas notificações vêm só com parâmetros na URL */
  }
  const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body.type ?? "";
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? (body.data?.id !== undefined ? String(body.data.id) : null);

  if (config.mercadoPago.webhookSecret) {
    const valid = verifyMercadoPagoSignature({
      secret: config.mercadoPago.webhookSecret,
      signature: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
      dataId,
    });
    if (!valid) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  } else if (config.isProduction) {
    console.warn("[payments] MERCADOPAGO_WEBHOOK_SECRET não configurado: notificação aceita sem conferir a assinatura.");
  }

  const provider = paymentProvider();
  if (type !== "payment" || !dataId || provider?.id !== "mercadopago") return NextResponse.json({ ok: true });

  const remote = await provider.getPayment(dataId).catch(() => null);
  if (!remote?.reference) return NextResponse.json({ ok: true });
  const payment = await prisma.payment.findUnique({ where: { id: remote.reference }, select: { id: true } });
  if (!payment) return NextResponse.json({ ok: true });
  // Aprovado: a solicitação é concluída aqui mesmo, ainda que o cliente não volte ao site.
  await applyProviderPayment(payment.id, remote);
  return NextResponse.json({ ok: true });
}
