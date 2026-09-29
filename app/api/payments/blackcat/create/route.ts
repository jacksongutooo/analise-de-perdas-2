import { NextResponse } from "next/server";
import { isRateLimited, logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { submissionSchema } from "@/lib/cases/submission";
import { SubmissionError } from "@/lib/cases/submit";
import { safeErrorMessage } from "@/lib/cpf";
import { PIX_ERROR_MESSAGE, createPixPayment } from "@/lib/payments";
import { clientIp, isSameOrigin, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRED = "Sua sessão de envio expirou. Preencha seus dados novamente.";

/**
 * Gera a cobrança PIX da taxa (BlackCat). Recebe só o aceite e as respostas do formulário: o valor é sempre
 * definido pelo servidor (qualquer valor enviado pelo navegador é ignorado) e a chave da API nunca sai daqui.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const draft = await authenticateDraft(req);
  if (!draft || draft.expired || draft.submittedAt) return NextResponse.json({ error: EXPIRED, field: "draft" }, { status: 401 });
  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);
  // Conta os pedidos registrados abaixo ("payment.checkout"); o limite é folgado porque redes móveis compartilham IP.
  if (await isRateLimited({ action: "payment.checkout", ip, limit: 60, windowMinutes: 60 })) {
    return NextResponse.json({ error: "Muitas tentativas em sequência. Aguarde alguns minutos." }, { status: 429 });
  }

  let body: { accept?: unknown; answers?: unknown; reuseOnly?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (body.accept !== true) {
    return NextResponse.json({ error: "Para continuar, marque a declaração de aceite.", field: "accept" }, { status: 422 });
  }
  const parsed = submissionSchema.safeParse(body.answers);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Dados inválidos.", field: issue?.path.join(".") }, { status: 422 });
  }

  try {
    const result = await createPixPayment({
      draftId: draft.id,
      isDemo: draft.isDemo,
      data: parsed.data,
      ip,
      userAgent: ua,
      // Só grava as respostas e devolve o PIX em aberto (volta à tela depois de rever as respostas).
      reuseOnly: body.reuseOnly === true,
    });
    await logAccess({ action: "payment.checkout", ip, userAgent: ua, targetType: "draft", targetId: draft.id });
    return NextResponse.json("alreadyPaid" in result ? { alreadyPaid: true } : { payment: result.view }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SubmissionError) return NextResponse.json({ error: error.message, field: error.field }, { status: 422 });
    console.error("[payments] falha ao gerar o PIX", safeErrorMessage(error));
    return NextResponse.json({ error: PIX_ERROR_MESSAGE, field: "payment" }, { status: 500 });
  }
}
