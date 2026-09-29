import { NextResponse } from "next/server";
import { isRateLimited, logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { setTrackingSession } from "@/lib/auth/tracking";
import { preferencesSchema, submissionSchema, type PreferencesData } from "@/lib/cases/submission";
import { SubmissionError, saveContactPreferences, submitCase } from "@/lib/cases/submit";
import { safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { syncDraftPayments } from "@/lib/payments";
import { clientIp, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRED = "Sua sessão expirou. Preencha seus dados novamente.";

function invalid(issue: { message: string; path: (string | number)[] } | undefined, prefix: string) {
  const field = issue?.path.join(".");
  return NextResponse.json({ error: issue?.message ?? "Dados inválidos.", field: field ? `${prefix}${field}` : undefined }, { status: 422 });
}

/**
 * Conclusão depois do pagamento aprovado: grava as preferências de contato (como comprovar, canal e horário) e
 * devolve o protocolo. A confirmação do pagamento normalmente já registrou a solicitação; se ainda não, ela é
 * registrada aqui. Idempotente: repetir o envio devolve o mesmo protocolo.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);
  const draft = await authenticateDraft(req);
  if (!draft) return NextResponse.json({ error: EXPIRED, field: "draft" }, { status: 401 });
  if (await isRateLimited({ action: "case.submit", ip, limit: 10, windowMinutes: 60 })) {
    return NextResponse.json({ error: "Muitas solicitações em sequência. Aguarde alguns minutos." }, { status: 429 });
  }

  let body: { answers?: unknown; preferences?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const prefs = preferencesSchema.safeParse(body.preferences);
  if (!prefs.success) return invalid(prefs.error.issues[0], "preferences.");
  const preferences: PreferencesData = prefs.data;

  /** Solicitação já registrada: grava as preferências (até o primeiro contato da equipe) e devolve o protocolo. */
  const existing = async () => {
    const current = await prisma.caseDraft.findUnique({ where: { id: draft.id }, select: { caseId: true } });
    const c = current?.caseId ? await prisma.case.findUnique({ where: { id: current.caseId }, select: { id: true, protocol: true } }) : null;
    if (!c) return null;
    await saveContactPreferences(c.id, preferences);
    await setTrackingSession(c.id);
    return NextResponse.json({ protocol: c.protocol });
  };

  if (draft.submittedAt) {
    const done = await existing();
    return done ?? NextResponse.json({ error: "Esta solicitação já foi enviada." }, { status: 409 });
  }
  if (draft.expired) return NextResponse.json({ error: EXPIRED, field: "draft" }, { status: 410 });

  const parsed = submissionSchema.safeParse(body.answers);
  if (!parsed.success) return invalid(parsed.error.issues[0], "");

  try {
    // A confirmação pode ainda não ter chegado: confere a situação (com a consulta de reserva ao gateway).
    await syncDraftPayments(draft.id, { finalize: false, manual: true });
    const result = await submitCase({
      draftId: draft.id,
      isDemo: draft.isDemo,
      answers: { kind: "current", data: parsed.data },
      preferences,
      ip,
      userAgent: ua,
    });
    await logAccess({ action: "case.submit", ip, userAgent: ua, targetType: "case", targetId: result.caseId });
    await setTrackingSession(result.caseId);
    return NextResponse.json({ protocol: result.protocol }, { status: 201 });
  } catch (error) {
    if (error instanceof SubmissionError) {
      if (error.field === "draft") {
        const done = await existing();
        if (done) return done;
      }
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.field === "draft" ? 409 : 422 });
    }
    console.error("[cases] falha ao registrar solicitação", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível enviar agora. Tente novamente em instantes." }, { status: 500 });
  }
}
