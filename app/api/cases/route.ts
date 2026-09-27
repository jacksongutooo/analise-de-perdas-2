import { NextResponse, after } from "next/server";
import { isRateLimited, logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { setTrackingSession } from "@/lib/auth/tracking";
import { submissionSchema } from "@/lib/cases/submission";
import { SubmissionError, submitCase } from "@/lib/cases/submit";
import { safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { processCaseDocuments } from "@/lib/extraction/process";
import { syncDraftPayments } from "@/lib/payments";
import { clientIp, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Envio final da solicitação, depois do pagamento aprovado. Idempotente: reenviar o mesmo rascunho (ou chegar
 * depois de a confirmação do pagamento já ter concluído a solicitação) devolve o mesmo protocolo.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);
  const draft = await authenticateDraft(req);
  if (!draft) {
    return NextResponse.json({ error: "Sessão de envio não encontrada. Envie os documentos novamente.", field: "documents" }, { status: 401 });
  }
  if (draft.submittedAt) {
    const existing = draft.caseId ? await prisma.case.findUnique({ where: { id: draft.caseId }, select: { id: true, protocol: true } }) : null;
    if (existing) {
      await setTrackingSession(existing.id);
      return NextResponse.json({ protocol: existing.protocol });
    }
    return NextResponse.json({ error: "Esta solicitação já foi enviada." }, { status: 409 });
  }
  if (draft.expired) {
    return NextResponse.json({ error: "Sua sessão de envio expirou. Envie os documentos novamente.", field: "documents" }, { status: 410 });
  }
  if (await isRateLimited({ action: "case.submit", ip, limit: 10, windowMinutes: 60 })) {
    return NextResponse.json({ error: "Muitas solicitações em sequência. Aguarde alguns minutos." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Dados inválidos.", field: issue?.path.join(".") }, { status: 422 });
  }

  const existingProtocol = async () => {
    const current = await prisma.caseDraft.findUnique({ where: { id: draft.id }, select: { caseId: true } });
    const c = current?.caseId ? await prisma.case.findUnique({ where: { id: current.caseId }, select: { id: true, protocol: true } }) : null;
    if (!c) return null;
    await setTrackingSession(c.id);
    return NextResponse.json({ protocol: c.protocol });
  };

  try {
    // A confirmação do pagamento pode ainda não ter chegado: consulta o gateway antes de enviar.
    await syncDraftPayments(draft.id, { finalize: false });
    const result = await submitCase({ draftId: draft.id, isDemo: draft.isDemo, data: parsed.data, ip, userAgent: ua });
    await logAccess({ action: "case.submit", ip, userAgent: ua, targetType: "case", targetId: result.caseId });
    await setTrackingSession(result.caseId);
    // Leitura automática dos documentos depois da resposta (não atrasa o solicitante).
    after(async () => {
      await processCaseDocuments(result.caseId);
    });
    return NextResponse.json({ protocol: result.protocol }, { status: 201 });
  } catch (error) {
    if (error instanceof SubmissionError) {
      if (error.field === "draft") {
        const existing = await existingProtocol();
        if (existing) return existing;
      }
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.field === "draft" ? 409 : 422 });
    }
    console.error("[cases] falha ao registrar solicitação", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível enviar agora. Tente novamente em instantes." }, { status: 500 });
  }
}
