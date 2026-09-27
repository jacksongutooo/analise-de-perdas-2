import { NextResponse } from "next/server";
import { isRateLimited, logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { deleteDraftCompletely, draftPaymentBlock } from "@/lib/cases/drafts";
import { maskCpf, normalizeCpf } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { clientIp, randomToken, sha256Hex, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRED = "Sua sessão de envio expirou. Preencha seus dados novamente.";

/** Cria o rascunho que recebe os arquivos antes do envio final. */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (await isRateLimited({ action: "draft.create", ip, limit: 20, windowMinutes: 60 })) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
  }
  const token = randomToken(32);
  const draft = await prisma.caseDraft.create({
    data: {
      tokenHash: sha256Hex(token),
      isDemo: config.demoMode,
      expiresAt: new Date(Date.now() + config.draftTtlDays * 86_400_000),
    },
  });
  await logAccess({ action: "draft.create", ip, userAgent: userAgent(req.headers), targetType: "draft", targetId: draft.id });
  return NextResponse.json({ id: draft.id, token }, { status: 201 });
}

/**
 * Registra o CPF do solicitante no rascunho. É com ele que o ComprovaBet é conferido no envio.
 * Depois que um ComprovaBet é enviado, o CPF só muda se o arquivo for removido antes.
 * A resposta traz apenas a versão mascarada (***.***.***-00).
 */
export async function PUT(req: Request) {
  const draft = await authenticateDraft(req);
  if (!draft || draft.expired || draft.submittedAt) return NextResponse.json({ error: EXPIRED }, { status: 401 });
  let body: { cpf?: unknown } = {};
  try {
    body = (await req.json()) as { cpf?: unknown };
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const cpf = normalizeCpf(String(body.cpf ?? "").slice(0, 20));
  if (!cpf) return NextResponse.json({ error: "Informe um CPF válido.", field: "cpf" }, { status: 422 });

  if (draft.cpf && draft.cpf !== cpf) {
    const sent = await prisma.document.count({ where: { draftId: draft.id, category: "comprovabet" } });
    if (sent > 0) {
      return NextResponse.json(
        { error: "Para alterar o CPF, remova antes o ComprovaBet enviado na etapa de documentos.", field: "cpf" },
        { status: 409 },
      );
    }
  }
  await prisma.caseDraft.update({ where: { id: draft.id }, data: { cpf } });
  return NextResponse.json({ cpfMasked: maskCpf(cpf) });
}

/** "Recomeçar": apaga o rascunho, o CPF informado e os arquivos enviados até agora (não depois de pagar). */
export async function DELETE(req: Request) {
  const draft = await authenticateDraft(req);
  if (draft && !draft.submittedAt && !(await deleteDraftCompletely(draft.id))) {
    const block = await draftPaymentBlock(draft.id);
    const error =
      block === "pending"
        ? "Há um pagamento em andamento para esta solicitação. Conclua ou aguarde a resposta do pagamento antes de recomeçar."
        : "O pagamento já foi confirmado. Conclua a solicitação.";
    return NextResponse.json({ error, field: "payment" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
