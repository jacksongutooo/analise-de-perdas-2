import { NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/cpf";
import { handleBlackCatNotification } from "@/lib/payments";
import { parseBlackCatNotification } from "@/lib/payments/blackcat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Notificações da BlackCat (postbackUrl de cada cobrança). Eventos: transaction.created, transaction.paid...
 * O conteúdo não é prova de pagamento: o status é sempre consultado na API da BlackCat antes de marcar como pago.
 * Idempotente pelo transactionId (entregas repetidas não são processadas de novo) e responde 200 logo em seguida;
 * a conclusão da solicitação (criação do caso) roda depois da resposta.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "Conteúdo grande demais." }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const notification = parseBlackCatNotification(payload);
  // Sem evento ou transactionId: nada a processar.
  if (!notification) return NextResponse.json({ ok: true, result: "ignored" });
  try {
    const { result } = await handleBlackCatNotification(notification);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[payments] falha ao processar notificação da BlackCat", safeErrorMessage(error));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
