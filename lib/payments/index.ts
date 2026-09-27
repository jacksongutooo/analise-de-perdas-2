// Pagamento da análise ANTES do envio da solicitação.
// Fluxo: tela de pagamento (aceite obrigatório) → checkout do gateway → confirmação (webhook ou consulta)
// → a solicitação é concluída. Com o pagamento aprovado, o caso é criado mesmo que o cliente não volte ao site.
import type { Payment, Prisma } from "@prisma/client";
import { after } from "next/server";
import { logAccess } from "@/lib/audit";
import { SubmissionError, assertDraftReady, submitCase } from "@/lib/cases/submit";
import { submissionSchema, type SubmissionData } from "@/lib/cases/submission";
import { SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { processCaseDocuments } from "@/lib/extraction/process";
import { parsePreAnalysis, type PreAnalysisStatus } from "@/lib/documents/pre-analysis";
import { runPreAnalysis } from "@/lib/documents/pre-analysis-run";
import { centsToDecimal, decimalToCents } from "@/lib/format";
import { site } from "@/lib/site";
import { demoProvider } from "./demo";
import { mercadoPagoProvider } from "./mercadopago";
import { DEMO_PRICE_CENTS, type PaymentProviderAdapter, type PaymentStatusValue, type ProviderPayment } from "./types";

export { DEMO_PRICE_CENTS, paymentMethodLabel } from "./types";
export type { PaymentStatusValue } from "./types";

/** Gateway em uso: Mercado Pago com token configurado; na demonstração, o pagamento simulado. */
export function paymentProvider(): PaymentProviderAdapter | null {
  if (config.mercadoPago.accessToken && !config.demoMode) return mercadoPagoProvider(config.mercadoPago.accessToken);
  if (config.demoMode) return demoProvider;
  return null;
}

export function providerLabel(id: string): string {
  return id === "mercadopago" ? "Mercado Pago" : "Pagamento de demonstração";
}

/** Valor da análise. Na demonstração sem valor configurado, usa um valor de exemplo (sinalizado na tela). */
export function analysisPrice(): { cents: number; example: boolean } | null {
  if (config.analysisPriceCents) return { cents: config.analysisPriceCents, example: false };
  return config.demoMode ? { cents: DEMO_PRICE_CENTS, example: true } : null;
}

export function paymentAvailable(): boolean {
  return Boolean(paymentProvider() && analysisPrice());
}

const PAID_DRAFT_TTL_DAYS = 30;
const REUSE_CHECKOUT_MINUTES = 30;

/**
 * Inicia o pagamento: grava o aceite e as respostas no rascunho, cria a tentativa e o checkout no gateway.
 * Se já houver pagamento aprovado, não cobra de novo.
 */
export async function startPayment(params: {
  draftId: string;
  isDemo: boolean;
  data: SubmissionData;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ checkoutUrl: string } | { alreadyPaid: true }> {
  const provider = paymentProvider();
  const price = analysisPrice();
  if (!provider || !price) {
    console.error("[payments] pagamento indisponível: configure MERCADOPAGO_ACCESS_TOKEN e ANALYSIS_PRICE.");
    throw new SubmissionError("O pagamento está indisponível no momento. Tente novamente mais tarde.", "payment");
  }
  await assertDraftReady(params.draftId);

  if (await prisma.payment.count({ where: { draftId: params.draftId, status: "approved" } })) return { alreadyPaid: true };

  // A pré-análise automática é refeita aqui (os arquivos podem ter mudado): documento de outro ano ou CPF impede o pagamento.
  const pre = await runPreAnalysis(params.draftId, params.data);
  if (pre.status === "blocked") throw new SubmissionError(pre.message, "analysis");

  const now = new Date();
  const draft = await prisma.caseDraft.findUniqueOrThrow({ where: { id: params.draftId }, select: { expiresAt: true } });
  const minExpiry = new Date(now.getTime() + PAID_DRAFT_TTL_DAYS * 86_400_000);
  await prisma.caseDraft.update({
    where: { id: params.draftId },
    data: {
      answers: params.data as unknown as Prisma.InputJsonValue,
      termsAcceptedAt: now,
      termsVersion: SERVICE_TERMS_VERSION,
      termsIp: params.ip,
      termsUserAgent: params.userAgent,
      // Quem inicia o pagamento tem mais tempo para voltar e concluir.
      expiresAt: draft.expiresAt > minExpiry ? draft.expiresAt : minExpiry,
    },
  });

  // Duplo clique ou volta rápida: reaproveita o checkout recente em vez de abrir outro.
  const recent = await prisma.payment.findFirst({
    where: {
      draftId: params.draftId,
      status: "pending",
      provider: provider.id,
      checkoutUrl: { not: null },
      createdAt: { gte: new Date(now.getTime() - REUSE_CHECKOUT_MINUTES * 60_000) },
      amount: centsToDecimal(price.cents),
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent?.checkoutUrl) return { checkoutUrl: recent.checkoutUrl };

  const payment = await prisma.payment.create({
    data: { draftId: params.draftId, provider: provider.id, amount: centsToDecimal(price.cents), isDemo: params.isDemo },
  });
  try {
    const secure = site.url.startsWith("https://");
    const checkout = await provider.createCheckout({
      paymentId: payment.id,
      amountCents: price.cents,
      description: "Análise documental de perdas em apostas",
      payer: { name: params.data.fullName, email: params.data.email },
      returnUrl: `${site.url.replace(/\/$/, "")}/analise?pagamento=retorno`,
      notificationUrl: provider.id === "mercadopago" && secure ? `${site.url.replace(/\/$/, "")}/api/payments/webhook/mercadopago` : null,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl } });
    return { checkoutUrl: checkout.checkoutUrl };
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "cancelled", statusDetail: "falha ao abrir o checkout" } });
    console.error("[payments] falha ao criar checkout", error instanceof Error ? error.message : "erro desconhecido");
    throw new SubmissionError("Não foi possível abrir o pagamento agora. Tente novamente em instantes.", "payment");
  }
}

/**
 * Aplica o que o gateway informou. Só aprova se o valor pago cobrir o valor da análise.
 * Com a aprovação, conclui a solicitação (cria o caso) — a menos que finalize seja false.
 */
export async function applyProviderPayment(
  paymentId: string,
  remote: Pick<ProviderPayment, "status" | "statusDetail" | "method" | "paidAt" | "amountCents"> & { providerPaymentId: string | null },
  opts: { finalize?: boolean } = {},
): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;
  if (payment.status === "approved" && remote.status !== "refunded") {
    if (opts.finalize !== false && payment.draftId) await finalizePaidDraft(payment.draftId);
    return payment;
  }
  const expected = decimalToCents(payment.amount) ?? 0;
  let status: PaymentStatusValue = remote.status;
  let statusDetail = remote.statusDetail;
  if (status === "approved" && remote.amountCents !== null && remote.amountCents < expected) {
    status = "pending";
    statusDetail = "valor pago menor que o valor da análise";
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status,
      statusDetail,
      method: remote.method ?? payment.method,
      providerPaymentId: remote.providerPaymentId ?? payment.providerPaymentId,
      paidAt: status === "approved" ? (remote.paidAt ?? new Date()) : payment.paidAt,
    },
  });
  if (status !== payment.status) {
    await logAccess({ action: `payment.${status}`, targetType: "payment", targetId: payment.id, subject: providerLabel(payment.provider) });
  }
  if (status === "approved" && !updated.draftId && !updated.caseId) {
    // Pagamento aprovado de um rascunho que já não existe: precisa de atenção da equipe (contato ou estorno).
    console.error("[payments] pagamento aprovado sem solicitação ligada", payment.id);
    await logAccess({ action: "payment.orphan", targetType: "payment", targetId: payment.id, subject: providerLabel(payment.provider), success: false });
  }
  if (status === "approved" && opts.finalize !== false && updated.draftId) await finalizePaidDraft(updated.draftId);
  return updated;
}

/** Tarefa depois da resposta (dentro de uma requisição); fora dela, roda em segundo plano. */
function runLater(task: () => Promise<void>) {
  const safe = () => task().catch((error) => console.error("[payments] tarefa posterior falhou", error instanceof Error ? error.message : error));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/** Com o pagamento aprovado, conclui a solicitação com as respostas gravadas no início do pagamento. */
export async function finalizePaidDraft(draftId: string): Promise<{ caseId: string; protocol: string; created: boolean } | null> {
  const draft = await prisma.caseDraft.findUnique({
    where: { id: draftId },
    select: { submittedAt: true, caseId: true, isDemo: true, answers: true, termsIp: true, termsUserAgent: true },
  });
  if (!draft) return null;
  const existing = async () => {
    const id = (await prisma.caseDraft.findUnique({ where: { id: draftId }, select: { caseId: true } }))?.caseId;
    const c = id ? await prisma.case.findUnique({ where: { id }, select: { id: true, protocol: true } }) : null;
    return c ? { caseId: c.id, protocol: c.protocol, created: false } : null;
  };
  if (draft.submittedAt) return existing();
  const parsed = submissionSchema.safeParse(draft.answers);
  if (!parsed.success) {
    console.error("[payments] pagamento aprovado com respostas inválidas no rascunho", draftId);
    return null;
  }
  try {
    const result = await submitCase({ draftId, isDemo: draft.isDemo, data: parsed.data, ip: draft.termsIp, userAgent: draft.termsUserAgent });
    await logAccess({ action: "case.submit", targetType: "case", targetId: result.caseId, subject: "pagamento aprovado" });
    // Leitura automática dos documentos do caso recém-criado.
    runLater(() => processCaseDocuments(result.caseId));
    return { ...result, created: true };
  } catch (error) {
    // Outro processo (notificação do gateway ou o próprio cliente) já concluiu a solicitação.
    if (error instanceof SubmissionError && error.field === "draft") return existing();
    if (error instanceof SubmissionError) {
      // Pagamento aprovado, mas a solicitação não pôde ser concluída: a equipe precisa agir (o erro fica no log).
      console.error("[payments] pagamento aprovado sem conclusão automática da solicitação", draftId, error.field, error.message);
      await logAccess({ action: "payment.finalize_failed", targetType: "draft", targetId: draftId, subject: error.field ?? null, success: false });
      return null;
    }
    throw error;
  }
}

/** Última consulta ao gateway por pagamento: evita repetir a consulta em intervalos muito curtos (melhor esforço, por instância). */
const lastRemoteCheck = new Map<string, number>();
const REMOTE_CHECK_INTERVAL_MS = 3_000;

function shouldCheckRemote(paymentId: string): boolean {
  const now = Date.now();
  if (now - (lastRemoteCheck.get(paymentId) ?? 0) < REMOTE_CHECK_INTERVAL_MS) return false;
  lastRemoteCheck.set(paymentId, now);
  if (lastRemoteCheck.size > 5_000) lastRemoteCheck.clear();
  return true;
}

/** Consulta o gateway quando ainda não há confirmação (a notificação pode atrasar ou não chegar). */
export async function syncDraftPayments(draftId: string, opts: { finalize?: boolean } = {}): Promise<Payment | null> {
  const payments = await prisma.payment.findMany({ where: { draftId }, orderBy: { createdAt: "desc" } });
  const approved = payments.find((p) => p.status === "approved");
  if (approved) {
    if (opts.finalize !== false) await finalizePaidDraft(draftId);
    return approved;
  }
  const provider = paymentProvider();
  if (provider?.id === "mercadopago") {
    const pending = payments.filter((x) => x.status === "pending" && x.provider === "mercadopago").slice(0, 3);
    for (const p of pending.filter((x) => shouldCheckRemote(x.id))) {
      const remote = await provider.findByReference(p.id).catch(() => null);
      if (!remote) continue;
      const updated = await applyProviderPayment(p.id, remote, opts);
      if (updated?.status === "approved") return updated;
    }
  }
  return (await prisma.payment.findFirst({ where: { draftId }, orderBy: { createdAt: "desc" } })) ?? null;
}

export type DraftPaymentView = {
  status: "none" | PaymentStatusValue;
  method: string | null;
  paidAt: string | null;
  checkoutUrl: string | null;
  termsAcceptedAt: string | null;
  protocol: string | null;
  /** Resultado da última pré-análise automática do ComprovaBet. */
  preAnalysis: PreAnalysisStatus | null;
};

/** Situação do pagamento do rascunho para a tela de pagamento (sincroniza com o gateway se preciso). */
export async function draftPaymentView(draftId: string): Promise<DraftPaymentView> {
  const payment = await syncDraftPayments(draftId);
  const draft = await prisma.caseDraft.findUnique({ where: { id: draftId }, select: { termsAcceptedAt: true, caseId: true, preAnalysis: true } });
  const c = draft?.caseId ? await prisma.case.findUnique({ where: { id: draft.caseId }, select: { protocol: true } }) : null;
  return {
    status: payment ? payment.status : "none",
    method: payment?.method ?? null,
    paidAt: payment?.paidAt?.toISOString() ?? null,
    checkoutUrl: payment?.status === "pending" ? payment.checkoutUrl : null,
    termsAcceptedAt: draft?.termsAcceptedAt?.toISOString() ?? null,
    protocol: c?.protocol ?? null,
    preAnalysis: parsePreAnalysis(draft?.preAnalysis)?.status ?? null,
  };
}
