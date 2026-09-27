import { NextResponse } from "next/server";
import { isRateLimited, logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { submissionSchema } from "@/lib/cases/submission";
import { SubmissionError, assertDraftReady } from "@/lib/cases/submit";
import { safeErrorMessage } from "@/lib/cpf";
import { runPreAnalysis } from "@/lib/documents/pre-analysis-run";
import { clientIp, isSameOrigin, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRED = "Sua sessão de envio expirou. Envie o ComprovaBet novamente.";

/** Pré-análise automática do ComprovaBet enviado, conferido com as respostas do formulário. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const draft = await authenticateDraft(req);
  if (!draft || draft.expired || draft.submittedAt) return NextResponse.json({ error: EXPIRED, field: "documents" }, { status: 401 });
  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);
  if (await isRateLimited({ action: "draft.pre_analysis", ip, limit: 40, windowMinutes: 60 })) {
    return NextResponse.json({ error: "Muitas tentativas em sequência. Aguarde alguns minutos." }, { status: 429 });
  }

  let body: { answers?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = submissionSchema.safeParse(body.answers);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Dados inválidos.", field: issue?.path.join(".") }, { status: 422 });
  }

  try {
    await assertDraftReady(draft.id);
    const analysis = await runPreAnalysis(draft.id, parsed.data);
    await logAccess({ action: "draft.pre_analysis", ip, userAgent: ua, targetType: "draft", targetId: draft.id, subject: analysis.status });
    return NextResponse.json({ analysis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SubmissionError) return NextResponse.json({ error: error.message, field: error.field }, { status: 422 });
    console.error("[pre-analysis] falha na pré-análise", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível fazer a pré-análise agora. Tente novamente." }, { status: 500 });
  }
}
