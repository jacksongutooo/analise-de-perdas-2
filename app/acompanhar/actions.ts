"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRateLimited, logAccess } from "@/lib/audit";
import { clearTrackingSession, getTrackingCaseId, setTrackingSession } from "@/lib/auth/tracking";
import { PAYMENT_NOTICE, SERVICE_TERMS_CHECKBOX, SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { isValidEmail } from "@/lib/format";
import { normalizeProtocol } from "@/lib/protocol";
import { clientIp, userAgent } from "@/lib/security";

export type TrackingLoginState = { error: string | null; protocol?: string; email?: string };

export async function trackingLogin(_prev: TrackingLoginState, formData: FormData): Promise<TrackingLoginState> {
  const protocolInput = String(formData.get("protocol") ?? "").slice(0, 30);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const h = await headers();
  const ip = clientIp(h);
  const keep = { protocol: protocolInput, email };

  if (await isRateLimited({ action: "tracking.login", ip, limit: 10, windowMinutes: 15, onlyFailures: true })) {
    return { ...keep, error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };
  }
  const protocol = normalizeProtocol(protocolInput, config.demoMode ? "DEMO" : "ANL");
  if (!protocol || !isValidEmail(email)) return { ...keep, error: "Confira o protocolo e o e-mail informados." };

  const found = await prisma.case.findUnique({
    where: { protocol },
    select: { id: true, isDemo: true, user: { select: { email: true } } },
  });
  const ok = Boolean(found && found.isDemo === config.demoMode && found.user.email.toLowerCase() === email);
  await logAccess({
    action: "tracking.login",
    subject: protocol,
    targetType: "case",
    targetId: found?.id ?? null,
    ip,
    userAgent: userAgent(h),
    success: ok,
  });
  if (!found || !ok) return { ...keep, error: "Não encontramos uma solicitação com esse protocolo e e-mail." };

  await setTrackingSession(found.id);
  redirect("/acompanhar");
}

export async function trackingLogout(): Promise<void> {
  await clearTrackingSession();
  redirect("/acompanhar");
}

/**
 * "Concluir envio" da documentação complementar. O caso volta para a etapa em que estava:
 * durante a análise (já paga), volta para a análise; antes disso, volta para a validação documental.
 */
export async function finishAdditionalDocuments(): Promise<void> {
  const caseId = await getTrackingCaseId();
  if (!caseId) redirect("/acompanhar");
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      isDemo: true,
      statusHistory: { where: { toStatus: "additional_documents" }, orderBy: { createdAt: "desc" }, take: 1, select: { fromStatus: true } },
      requests: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, _count: { select: { documents: true } } } },
    },
  });
  const request = c?.requests[0];
  if (!c || c.isDemo !== config.demoMode || !request) redirect("/acompanhar");
  if (request._count.documents === 0) redirect("/acompanhar/documentos?erro=vazio");

  const before = c.statusHistory[0]?.fromStatus;
  const back = before === "under_review" || before === "payment_confirmed" ? before : "documents_received";
  await prisma.$transaction([
    prisma.documentRequest.update({ where: { id: request.id }, data: { status: "fulfilled", fulfilledAt: new Date() } }),
    ...(c.status === "additional_documents"
      ? [
          prisma.case.update({ where: { id: caseId }, data: { status: back } }),
          prisma.statusHistory.create({
            data: { caseId, fromStatus: "additional_documents", toStatus: back, publicMessage: "Documentos complementares recebidos." },
          }),
        ]
      : []),
  ]);
  redirect("/acompanhar");
}

/**
 * Aceite das condições do serviço de análise, obrigatório antes do pagamento.
 * Registra data e hora, versão do texto, IP e navegador. Só vale para casos com o documento aprovado.
 */
export async function acceptServiceTerms(formData: FormData): Promise<void> {
  const caseId = await getTrackingCaseId();
  if (!caseId) redirect("/acompanhar");
  if (formData.get("accept") !== "yes") redirect("/acompanhar/pagamento?erro=aceite");
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, isDemo: true } });
  if (!c || c.isDemo !== config.demoMode || c.status !== "awaiting_payment") redirect("/acompanhar");

  const h = await headers();
  const ip = clientIp(h);
  const ua = userAgent(h);
  await prisma.serviceAgreement.create({
    data: {
      caseId,
      accepted: true,
      acceptedAt: new Date(),
      termsVersion: SERVICE_TERMS_VERSION,
      text: `Importante: ${PAYMENT_NOTICE}\n\n${SERVICE_TERMS_CHECKBOX}`,
      ip,
      userAgent: ua,
    },
  });
  await logAccess({ action: "payment.terms_accepted", targetType: "case", targetId: caseId, ip, userAgent: ua });
  redirect("/acompanhar/pagamento");
}

/** O cliente informa que já pagou: a equipe confere o recebimento e confirma no painel. */
export async function informPaymentDone(): Promise<void> {
  const caseId = await getTrackingCaseId();
  if (!caseId) redirect("/acompanhar");
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { status: true, isDemo: true, paymentStatus: true, _count: { select: { agreements: true } } },
  });
  if (!c || c.isDemo !== config.demoMode || c.status !== "awaiting_payment") redirect("/acompanhar");
  if (c._count.agreements === 0) redirect("/acompanhar/pagamento?erro=aceite");
  if (c.paymentStatus === "pending") {
    await prisma.case.update({ where: { id: caseId }, data: { paymentStatus: "awaiting_confirmation" } });
    const h = await headers();
    await logAccess({ action: "payment.informed", targetType: "case", targetId: caseId, ip: clientIp(h), userAgent: userAgent(h) });
  }
  redirect("/acompanhar/pagamento?informado=1");
}
