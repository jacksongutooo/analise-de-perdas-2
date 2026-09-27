import { NextResponse } from "next/server";
import { isRateLimited, logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { setTrackingSession } from "@/lib/auth/tracking";
import { submissionSchema } from "@/lib/cases/submission";
import { SubmissionError } from "@/lib/cases/submit";
import { safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { draftPaymentView, startPayment } from "@/lib/payments";
import { clientIp, isSameOrigin, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRED = "Sua sessão de envio expirou. Preencha seus dados novamente.";

/** Inicia o pagamento da análise: grava o aceite e as respostas e devolve o endereço do checkout. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const draft = await authenticateDraft(req);
  if (!draft || draft.expired || draft.submittedAt) return NextResponse.json({ error: EXPIRED, field: "documents" }, { status: 401 });
  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);
  if (await isRateLimited({ action: "payment.start", ip, limit: 20, windowMinutes: 60 })) {
    return NextResponse.json({ error: "Muitas tentativas em sequência. Aguarde alguns minutos." }, { status: 429 });
  }

  let body: { accept?: unknown; answers?: unknown } = {};
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
    const result = await startPayment({ draftId: draft.id, isDemo: draft.isDemo, data: parsed.data, ip, userAgent: ua });
    await logAccess({ action: "payment.checkout", ip, userAgent: ua, targetType: "draft", targetId: draft.id });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SubmissionError) return NextResponse.json({ error: error.message, field: error.field }, { status: 422 });
    console.error("[payments] falha ao iniciar pagamento", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível abrir o pagamento agora. Tente novamente em instantes." }, { status: 500 });
  }
}

/** Situação do pagamento (consulta o gateway se a confirmação ainda não chegou). */
export async function GET(req: Request) {
  const draft = await authenticateDraft(req);
  if (!draft) return NextResponse.json({ error: EXPIRED, field: "documents" }, { status: 401 });
  try {
    const view = await draftPaymentView(draft.id);
    if (view.protocol) {
      // Pagamento aprovado e solicitação concluída: o acompanhamento já fica liberado neste navegador.
      const c = await prisma.case.findUnique({ where: { protocol: view.protocol }, select: { id: true } });
      if (c) await setTrackingSession(c.id);
    }
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[payments] falha ao consultar pagamento", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível consultar o pagamento agora." }, { status: 502 });
  }
}
