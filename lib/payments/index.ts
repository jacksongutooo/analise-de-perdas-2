// Pagamento da taxa ANTES do registro da solicitação, por PIX (BlackCat).
// Fluxo: tela de pagamento (aceite obrigatório) → "Gerar PIX" (cobrança criada no servidor, com o valor definido
// aqui) → QR Code e copia e cola na própria tela → confirmação pela notificação transaction.paid, sempre conferida
// na consulta de status da BlackCat → a solicitação é registrada, mesmo que o cliente feche a página.
import { Prisma, type Payment } from "@prisma/client";
import { after } from "next/server";
import { logAccess } from "@/lib/audit";
import { SubmissionError, assertDraftReady, submitCase } from "@/lib/cases/submit";
import { parseStoredAnswers, type SubmissionData } from "@/lib/cases/submission";
import { SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { normalizeCpf, safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { processCaseDocuments } from "@/lib/extraction/process";
import { centsToDecimal, decimalToCents, normalizePhoneBR } from "@/lib/format";
import { randomToken } from "@/lib/security";
import { site } from "@/lib/site";
import { blackCatProvider, type BlackCatNotification } from "./blackcat";
import { demoProvider } from "./demo";
import { pixQrDataUri } from "./qr";
import {
  DEMO_PRICE_CENTS,
  PIX_ERROR_MESSAGE,
  providerLabel,
  type PaymentProviderAdapter,
  type PaymentStatusValue,
  type PixCharge,
  type ProviderTransaction,
} from "./types";

export { DEMO_PRICE_CENTS, PIX_ERROR_MESSAGE, paymentMethodLabel, providerLabel } from "./types";
export type { PaymentStatusValue } from "./types";

/** Gateway em uso: na demonstração, o PIX simulado; fora dela, a BlackCat (com a chave configurada). */
export function paymentProvider(): PaymentProviderAdapter | null {
  if (config.demoMode) return demoProvider;
  if (config.blackcat.apiKey) return blackCatProvider({ apiKey: config.blackcat.apiKey, baseUrl: config.blackcat.baseUrl });
  return null;
}

/** Valor da análise. Na demonstração sem valor configurado, usa um valor de exemplo (sinalizado na tela). */
export function analysisPrice(): { cents: number; example: boolean } | null {
  if (config.analysisPriceCents) return { cents: config.analysisPriceCents, example: false };
  return config.demoMode ? { cents: DEMO_PRICE_CENTS, example: true } : null;
}

export function paymentAvailable(): boolean {
  return Boolean(paymentProvider() && analysisPrice());
}

/** Endereço das notificações da BlackCat (só com o site em https: o gateway não alcança endereços locais). */
export function blackCatWebhookUrl(): string | null {
  return site.url.startsWith("https://") ? `${site.url.replace(/\/+$/, "")}/api/payments/webhook/blackcat` : null;
}

const PIX_ITEM_TITLE = "Serviço de análise e acompanhamento";
const PIX_EXPIRES_IN_DAYS = 1;
const PAID_DRAFT_TTL_DAYS = 30;
/** Um PIX aberto é reaproveitado (cliques repetidos, volta à tela) enquanto faltar ao menos este tempo para expirar. */
const REUSE_MIN_REMAINING_MS = 10 * 60_000;
/** Trava enquanto a cobrança é criada: um segundo clique espera e recebe o mesmo PIX. */
const LOCK_MS = 45_000;
/** Consulta de reserva no gateway, quando a notificação não chega: no máximo uma por minuto por pagamento. */
const AUTO_CHECK_INTERVAL_MS = 60_000;
const AUTO_CHECK_MIN_AGE_MS = 30_000;
/** Quando o cliente toca em "Verificar pagamento". */
const MANUAL_CHECK_INTERVAL_MS = 10_000;
/** Notificação repetida enquanto a primeira ainda é processada: só é processada de novo depois deste tempo. */
const EVENT_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Referência interna única enviada ao gateway (externalRef), ex.: AP-20260928-K7Q2M9XDPA. */
function newExternalReference(now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomToken(12).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  return `AP-${day}-${random}`;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** PIX em aberto que pode ser mostrado de novo em vez de gerar outro (mesmo gateway e mesmo valor). */
async function reusablePix(draftId: string, providerId: PaymentProviderAdapter["id"], amountCents: number): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: {
      draftId,
      provider: providerId,
      status: "pending",
      amount: centsToDecimal(amountCents),
      pixCopyPaste: { not: null },
      pixExpiresAt: { gt: new Date(Date.now() + REUSE_MIN_REMAINING_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function hasPaidPayment(draftId: string): Promise<boolean> {
  return (await prisma.payment.count({ where: { draftId, status: "paid" } })) > 0;
}

/**
 * Gera a cobrança PIX da análise. Grava o aceite e as respostas no rascunho, valida os dados do cliente, define o
 * valor no servidor e cria a cobrança no gateway. Cliques repetidos recebem o mesmo PIX; com o pagamento já
 * confirmado, não cobra de novo.
 */
export async function createPixPayment(params: {
  draftId: string;
  isDemo: boolean;
  data: SubmissionData;
  ip: string | null;
  userAgent: string | null;
  /** Só grava as respostas e devolve a situação atual, sem criar cobrança. */
  reuseOnly?: boolean;
}): Promise<{ alreadyPaid: true } | { view: DraftPaymentView }> {
  const provider = paymentProvider();
  const price = analysisPrice();
  if (!provider || !price) {
    console.error("[payments] pagamento indisponível: configure BLACKCAT_API_KEY e ANALYSIS_PRICE.");
    throw new SubmissionError("O pagamento está indisponível no momento. Tente novamente mais tarde.", "payment");
  }
  const { draftId, data } = params;
  await assertDraftReady(draftId);

  // Dados do cliente enviados ao gateway, validados no servidor (nome e e-mail já passaram pelo submissionSchema).
  const draft = await prisma.caseDraft.findUniqueOrThrow({ where: { id: draftId }, select: { cpf: true, expiresAt: true } });
  const cpf = normalizeCpf(draft.cpf ?? "");
  if (!cpf) throw new SubmissionError("Informe um CPF válido para continuar.", "cpf");
  const phone = normalizePhoneBR(data.whatsapp);
  if (!phone) throw new SubmissionError("Informe um WhatsApp válido com DDD.", "whatsapp");

  if (await hasPaidPayment(draftId)) return { alreadyPaid: true };

  const now = new Date();
  const minExpiry = new Date(now.getTime() + PAID_DRAFT_TTL_DAYS * 86_400_000);
  await prisma.caseDraft.update({
    where: { id: draftId },
    data: {
      answers: data as unknown as Prisma.InputJsonValue,
      termsAcceptedAt: now,
      termsVersion: SERVICE_TERMS_VERSION,
      termsIp: params.ip,
      termsUserAgent: params.userAgent,
      // Quem gera o PIX tem mais tempo para voltar e concluir.
      expiresAt: draft.expiresAt > minExpiry ? draft.expiresAt : minExpiry,
    },
  });

  if (params.reuseOnly) return { view: await draftPaymentView(draftId, { remote: false }) };

  // Trava do rascunho: só uma cobrança é criada por vez (duplo clique, duas abas). Quem chega enquanto outro pedido
  // gera o PIX espera e recebe o mesmo PIX; se o outro pedido falhar, assume a trava e tenta de novo.
  let lockUntil: Date | null = null;
  for (let attempt = 0; attempt < 25 && !lockUntil; attempt++) {
    const until = new Date(Date.now() + LOCK_MS);
    const locked = await prisma.caseDraft.updateMany({
      where: { id: draftId, OR: [{ paymentLockUntil: null }, { paymentLockUntil: { lt: new Date() } }] },
      data: { paymentLockUntil: until },
    });
    if (locked.count) {
      lockUntil = until;
      break;
    }
    await sleep(750);
    if (await hasPaidPayment(draftId)) return { alreadyPaid: true };
    if (await reusablePix(draftId, provider.id, price.cents)) return { view: await draftPaymentView(draftId, { remote: false }) };
  }
  if (!lockUntil) throw new SubmissionError("Seu PIX ainda está sendo gerado. Aguarde alguns instantes e tente novamente.", "payment");

  try {
    if (await reusablePix(draftId, provider.id, price.cents)) return { view: await draftPaymentView(draftId, { remote: false }) };

    const externalReference = newExternalReference(now);
    const payment = await prisma.payment.create({
      data: {
        draftId,
        provider: provider.id,
        status: "pending",
        amount: centsToDecimal(price.cents),
        paymentMethod: "pix",
        externalReference,
        isDemo: params.isDemo,
      },
    });

    const postbackUrl = provider.id === "blackcat" ? blackCatWebhookUrl() : null;
    if (provider.id === "blackcat" && !postbackUrl) {
      console.warn("[payments] NEXT_PUBLIC_SITE_URL sem https: a BlackCat não terá para onde enviar a confirmação (webhook).");
    }
    let charge: PixCharge;
    try {
      charge = await provider.createPixCharge({
        externalRef: externalReference,
        amountCents: price.cents,
        title: PIX_ITEM_TITLE,
        customer: { name: data.fullName, email: data.email, phone, cpf },
        postbackUrl,
        expiresInDays: PIX_EXPIRES_IN_DAYS,
      });
    } catch (error) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed", statusDetail: "falha ao gerar o PIX" } });
      console.error("[payments] falha ao gerar o PIX", payment.id, safeErrorMessage(error));
      await logAccess({ action: "payment.pix_failed", targetType: "payment", targetId: payment.id, subject: provider.label, success: false });
      throw new SubmissionError(PIX_ERROR_MESSAGE, "payment");
    }
    if (charge.amountCents !== null && charge.amountCents !== price.cents) {
      console.error("[payments] valor da cobrança diferente do valor da análise", payment.id, charge.amountCents, price.cents);
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerTransactionId: charge.transactionId,
        providerStatus: charge.providerStatus,
        // A criação nunca confirma pagamento: a confirmação vem da notificação ou da consulta de status.
        status: charge.status === "paid" ? "pending" : charge.status,
        pixCopyPaste: charge.copyPaste,
        pixQrCode: charge.qrCodeImage,
        pixExpiresAt: charge.expiresAt ?? new Date(now.getTime() + PIX_EXPIRES_IN_DAYS * 86_400_000),
        providerPayload: { charge: charge.audit } as Prisma.InputJsonValue,
      },
    });
    await logAccess({ action: "payment.pix_created", targetType: "payment", targetId: payment.id, subject: provider.label });
    return { view: await draftPaymentView(draftId, { remote: false }) };
  } finally {
    // Libera só a própria trava (se ela venceu e outro pedido assumiu, não mexe na dele).
    await prisma.caseDraft.updateMany({ where: { id: draftId, paymentLockUntil: lockUntil }, data: { paymentLockUntil: null } });
  }
}

type FinalizeMode = "now" | "later" | false;

/**
 * Aplica a situação da transação consultada no gateway. Só confirma se o valor pago cobrir o valor da análise.
 * A atualização é condicional (só quem encontra o status anterior muda o registro): notificações repetidas ou
 * simultâneas não processam o pagamento duas vezes. Confirmado, conclui a solicitação (cria o caso).
 */
export async function applyProviderTransaction(
  paymentId: string,
  remote: Pick<ProviderTransaction, "status" | "providerStatus" | "paymentMethod" | "amountCents" | "paidAt" | "audit">,
  opts: { source: string; finalize?: FinalizeMode },
): Promise<Payment | null> {
  const finalize = opts.finalize ?? "now";
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;
  if (payment.status === "paid" && remote.status !== "refunded") {
    await finalizeIfPaid(payment, finalize);
    return payment;
  }
  // PIX vencido, recusado ou cancelado não volta a ficar pendente (só uma confirmação tardia muda o registro).
  if (remote.status === "pending" && payment.status !== "pending") return payment;

  const expected = decimalToCents(payment.amount) ?? 0;
  let status: PaymentStatusValue = remote.status;
  let statusDetail = payment.statusDetail;
  if (status === "paid" && remote.amountCents !== null && remote.amountCents < expected) {
    status = "pending";
    statusDetail = "valor pago menor que o valor da análise";
  } else if (status === "paid") {
    statusDetail = payment.provider === "demo" ? "confirmado na demonstração" : `confirmado pela ${providerLabel(payment.provider)} (${opts.source})`;
  } else if (status !== payment.status) {
    statusDetail = `${remote.providerStatus ?? status} (${opts.source})`;
  }

  const now = new Date();
  const previous = (payment.providerPayload && typeof payment.providerPayload === "object" ? payment.providerPayload : {}) as Record<string, unknown>;
  const changed = status !== payment.status || (remote.providerStatus ?? payment.providerStatus) !== payment.providerStatus;
  if (!changed) {
    // Nada mudou: não reescreve o registro.
    return payment;
  }
  const result = await prisma.payment.updateMany({
    where: { id: payment.id, status: payment.status },
    data: {
      status,
      statusDetail,
      providerStatus: remote.providerStatus ?? payment.providerStatus,
      paymentMethod: remote.paymentMethod ?? payment.paymentMethod,
      paidAt: status === "paid" ? (remote.paidAt ?? now) : payment.paidAt,
      providerPayload: { ...previous, lastStatus: { ...remote.audit, source: opts.source, at: now.toISOString() } } as Prisma.InputJsonValue,
    },
  });
  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  if (!updated) return null;
  if (result.count === 0) {
    // Outra requisição atualizou antes (ex.: notificação repetida): não processa de novo.
    await finalizeIfPaid(updated, finalize);
    return updated;
  }

  await logAccess({ action: `payment.${status}`, targetType: "payment", targetId: payment.id, subject: `${providerLabel(payment.provider)} · ${opts.source}` });
  if (status === "paid" && !updated.draftId && !updated.caseId) {
    // Pagamento confirmado de um rascunho que já não existe: precisa de atenção da equipe (contato ou estorno).
    console.error("[payments] pagamento confirmado sem solicitação ligada", payment.id);
    await logAccess({ action: "payment.orphan", targetType: "payment", targetId: payment.id, subject: providerLabel(payment.provider), success: false });
  }
  await finalizeIfPaid(updated, finalize);
  return updated;
}

async function finalizeIfPaid(payment: Payment, mode: FinalizeMode) {
  if (payment.status !== "paid" || !payment.draftId || mode === false) return;
  const draftId = payment.draftId;
  if (mode === "later") runLater(async () => void (await finalizePaidDraft(draftId)));
  else await finalizePaidDraft(draftId);
}

/** Tarefa depois da resposta (dentro de uma requisição); fora dela, roda em segundo plano. */
function runLater(task: () => Promise<void>) {
  const safe = () => task().catch((error) => console.error("[payments] tarefa posterior falhou", safeErrorMessage(error)));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/**
 * Com o pagamento confirmado, registra a solicitação com as respostas gravadas quando o PIX foi gerado (as do
 * formulário anterior também valem: um PIX gerado antes da atualização do site pode ser pago depois).
 */
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
  const answers = parseStoredAnswers(draft.answers);
  if (!answers) {
    console.error("[payments] pagamento confirmado com respostas inválidas no rascunho", draftId);
    await logAccess({ action: "payment.finalize_failed", targetType: "draft", targetId: draftId, subject: "answers", success: false });
    return null;
  }
  try {
    const result = await submitCase({ draftId, isDemo: draft.isDemo, answers, ip: draft.termsIp, userAgent: draft.termsUserAgent });
    await logAccess({ action: "case.submit", targetType: "case", targetId: result.caseId, subject: "pagamento confirmado" });
    // Leitura automática dos documentos enviados no formulário anterior (o formulário atual não tem arquivos).
    if (answers.kind === "legacy") runLater(() => processCaseDocuments(result.caseId));
    return { ...result, created: true };
  } catch (error) {
    // Outro processo (notificação do gateway ou o próprio cliente) já concluiu a solicitação.
    if (error instanceof SubmissionError && error.field === "draft") return existing();
    if (error instanceof SubmissionError) {
      // Pagamento confirmado, mas a solicitação não pôde ser concluída: a equipe precisa agir (o erro fica no log).
      console.error("[payments] pagamento confirmado sem conclusão automática da solicitação", draftId, error.field, error.message);
      await logAccess({ action: "payment.finalize_failed", targetType: "draft", targetId: draftId, subject: error.field ?? null, success: false });
      return null;
    }
    throw error;
  }
}

/**
 * Consulta de reserva da transação no gateway (a confirmação normal chega pela notificação). A trava pelo
 * horário da última consulta vale entre instâncias do servidor: nunca vira uma consulta contínua.
 */
async function checkPaymentRemote(payment: Payment, minIntervalMs: number, finalize: FinalizeMode): Promise<Payment | null> {
  const provider = paymentProvider();
  if (!provider || provider.id !== payment.provider || !payment.providerTransactionId) return null;
  const now = new Date();
  const claimed = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: { in: ["pending", "expired"] },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - minIntervalMs) } }],
    },
    data: { lastCheckedAt: now },
  });
  if (!claimed.count) return null;
  const remote = await provider.getTransaction(payment.providerTransactionId).catch((error) => {
    console.error("[payments] falha na consulta de status no gateway", payment.id, safeErrorMessage(error));
    return null;
  });
  if (!remote) return null;
  return applyProviderTransaction(payment.id, remote, { source: "consulta de status", finalize });
}

/**
 * Situação dos pagamentos do rascunho, a partir do banco. Com o PIX aberto e sem confirmação, faz no máximo uma
 * consulta de reserva no gateway por minuto (ou a cada 10 s com "Verificar pagamento"). PIX vencido fica EXPIRED.
 */
export async function syncDraftPayments(draftId: string, opts: { finalize?: boolean; remote?: boolean; manual?: boolean } = {}): Promise<Payment | null> {
  const finalize: FinalizeMode = opts.finalize === false ? false : "now";
  const payments = await prisma.payment.findMany({ where: { draftId }, orderBy: { createdAt: "desc" } });
  const paid = payments.find((p) => p.status === "paid");
  if (paid) {
    if (finalize) await finalizePaidDraft(draftId);
    return paid;
  }
  let latest = payments[0] ?? null;
  if (latest?.status === "pending" && opts.remote !== false) {
    const nowMs = Date.now();
    const expired = Boolean(latest.pixExpiresAt && latest.pixExpiresAt.getTime() <= nowMs);
    const old = nowMs - latest.createdAt.getTime() >= AUTO_CHECK_MIN_AGE_MS;
    if (expired || opts.manual || old) {
      // No vencimento, uma última consulta (o pagamento pode ter sido feito no último instante).
      const interval = expired ? 0 : opts.manual ? MANUAL_CHECK_INTERVAL_MS : AUTO_CHECK_INTERVAL_MS;
      const updated = await checkPaymentRemote(latest, interval, finalize);
      if (updated) latest = updated;
    }
    if (latest.status === "pending" && latest.pixExpiresAt && latest.pixExpiresAt.getTime() <= Date.now()) {
      await prisma.payment.updateMany({ where: { id: latest.id, status: "pending" }, data: { status: "expired", statusDetail: "PIX expirado sem pagamento" } });
      latest = (await prisma.payment.findUnique({ where: { id: latest.id } })) ?? latest;
    }
  }
  return latest;
}

/** PIX em aberto exibido ao cliente. */
export type PixView = {
  transactionId: string;
  copyPaste: string;
  /** QR Code (imagem em data URI): o devolvido pelo gateway ou desenhado a partir do copia e cola. */
  qrCode: string;
  expiresAt: string | null;
  amountCents: number;
  createdAt: string;
};

export type DraftPaymentView = {
  status: "none" | PaymentStatusValue;
  method: string | null;
  paidAt: string | null;
  termsAcceptedAt: string | null;
  protocol: string | null;
  /** PIX aguardando pagamento (só enquanto está em aberto). */
  pix: PixView | null;
  /** PIX simulado (modo demonstração). */
  demo: boolean;
};

function pixView(payment: Payment): PixView | null {
  if (payment.status !== "pending" || !payment.pixCopyPaste || !payment.providerTransactionId) return null;
  return {
    transactionId: payment.providerTransactionId,
    copyPaste: payment.pixCopyPaste,
    qrCode: payment.pixQrCode ?? pixQrDataUri(payment.pixCopyPaste),
    expiresAt: payment.pixExpiresAt?.toISOString() ?? null,
    amountCents: decimalToCents(payment.amount) ?? 0,
    createdAt: payment.createdAt.toISOString(),
  };
}

/** Situação do pagamento do rascunho para a tela de pagamento (o navegador pergunta ao nosso servidor, não ao gateway). */
export async function draftPaymentView(draftId: string, opts: { remote?: boolean; manual?: boolean } = {}): Promise<DraftPaymentView> {
  const payment = await syncDraftPayments(draftId, { remote: opts.remote, manual: opts.manual });
  const draft = await prisma.caseDraft.findUnique({ where: { id: draftId }, select: { termsAcceptedAt: true, caseId: true } });
  const c = draft?.caseId ? await prisma.case.findUnique({ where: { id: draft.caseId }, select: { protocol: true } }) : null;
  return {
    status: payment ? payment.status : "none",
    method: payment?.paymentMethod ?? null,
    paidAt: payment?.paidAt?.toISOString() ?? null,
    termsAcceptedAt: draft?.termsAcceptedAt?.toISOString() ?? null,
    protocol: c?.protocol ?? null,
    pix: payment ? pixView(payment) : null,
    demo: payment?.provider === "demo",
  };
}

/**
 * Notificação (webhook) da BlackCat. Idempotente pelo transactionId: cada evento fica registrado uma vez em
 * payment_events e entregas repetidas não são processadas de novo. O conteúdo da notificação não é prova de
 * pagamento: a situação é consultada na API da BlackCat antes de qualquer mudança.
 */
export async function handleBlackCatNotification(notification: BlackCatNotification): Promise<{ result: string; paymentId: string | null }> {
  const { event, transactionId, externalReference } = notification;
  const payment =
    (await prisma.payment.findFirst({ where: { provider: "blackcat", providerTransactionId: transactionId } })) ??
    (externalReference
      ? await prisma.payment.findFirst({
          where: { provider: "blackcat", externalReference, OR: [{ providerTransactionId: null }, { providerTransactionId: transactionId }] },
        })
      : null);
  if (!payment) {
    console.warn("[payments] notificação da BlackCat sem pagamento correspondente", event);
    return { result: "not_found", paymentId: null };
  }
  if (!payment.providerTransactionId) {
    // A venda foi criada na BlackCat, mas a resposta não chegou ao site (ex.: tempo esgotado): liga pela referência interna.
    await prisma.payment
      .updateMany({ where: { id: payment.id, providerTransactionId: null }, data: { providerTransactionId: transactionId } })
      .catch((error) => console.error("[payments] falha ao ligar a transação pela referência", payment.id, safeErrorMessage(error)));
  }

  // Registro do evento (auditoria + idempotência).
  let eventRow: { id: string; processedAt: Date | null; receivedAt: Date };
  try {
    eventRow = await prisma.paymentEvent.create({
      data: {
        provider: "blackcat",
        event,
        transactionId,
        paymentId: payment.id,
        status: notification.status,
        payload: notification.audit as Prisma.InputJsonValue,
      },
      select: { id: true, processedAt: true, receivedAt: true },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    eventRow = await prisma.paymentEvent.update({
      where: { provider_transactionId_event: { provider: "blackcat", transactionId, event } },
      data: { deliveries: { increment: 1 } },
      select: { id: true, processedAt: true, receivedAt: true },
    });
    // Entrega repetida: já processada, ou ainda em processamento pela primeira entrega (menos de 1 minuto).
    // Uma entrega antiga que falhou (sem processamento) é processada de novo.
    if (eventRow.processedAt) return { result: "duplicate", paymentId: payment.id };
    if (Date.now() - eventRow.receivedAt.getTime() < EVENT_RETRY_AFTER_MS) return { result: "in_progress", paymentId: payment.id };
  }
  const done = async (result: string, processed = true) => {
    await prisma.paymentEvent.update({ where: { id: eventRow.id }, data: { result, processedAt: processed ? new Date() : null } });
    return { result, paymentId: payment.id };
  };

  if (payment.status === "paid" && (event === "transaction.paid" || event === "transaction.created")) {
    // Já confirmado antes: só garante que a solicitação foi concluída. (Outros eventos, como um estorno, são consultados.)
    await finalizeIfPaid(payment, "later");
    return done("already_paid");
  }
  if (event === "transaction.created") return done("ignored");

  const provider = paymentProvider();
  if (provider?.id !== "blackcat") {
    console.error("[payments] notificação da BlackCat recebida sem BLACKCAT_API_KEY configurada: não há como confirmar.");
    return done("provider_unavailable", false);
  }
  // Confirmação real: consulta a transação na BlackCat.
  let remote: ProviderTransaction | null;
  try {
    remote = await provider.getTransaction(transactionId);
  } catch (error) {
    console.error("[payments] falha ao confirmar a notificação na BlackCat", payment.id, safeErrorMessage(error));
    // Fica sem processar: uma nova entrega (ou a consulta de reserva) tenta de novo.
    return done("error", false);
  }
  if (!remote) return done("not_found_remote");
  await prisma.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: new Date() } });
  const updated = await applyProviderTransaction(payment.id, remote, { source: `webhook ${event}`, finalize: "later" });
  const status = updated?.status ?? "not_found";
  if (event === "transaction.paid" && status === "pending") {
    // A notificação diz que foi pago, mas a consulta ainda não confirma (a API pode atualizar com atraso): novas
    // consultas em segundo plano; o evento fica sem processar, e uma nova entrega também é processada.
    runLater(() => retryPaidConfirmation(payment.id, transactionId, eventRow.id));
    return done("awaiting_confirmation", false);
  }
  return done(status);
}

const CONFIRMATION_RETRY_DELAYS_MS = [3_000, 10_000, 25_000];

/** Novas consultas depois de um transaction.paid ainda não confirmado na API (dentro do tempo da requisição). */
async function retryPaidConfirmation(paymentId: string, transactionId: string, eventId: string) {
  const provider = paymentProvider();
  if (provider?.id !== "blackcat") return;
  for (const delay of CONFIRMATION_RETRY_DELAYS_MS) {
    await sleep(delay);
    const remote = await provider.getTransaction(transactionId).catch(() => null);
    if (!remote || remote.status === "pending") continue;
    const updated = await applyProviderTransaction(paymentId, remote, { source: "webhook transaction.paid", finalize: "now" });
    await prisma.paymentEvent.update({ where: { id: eventId }, data: { result: updated?.status ?? "not_found", processedAt: new Date() } });
    return;
  }
}

/**
 * Conciliação de segurança (rotina diária): PIX da BlackCat ainda pendentes, gerados nos últimos dias, têm o status
 * consultado uma vez. Cobre notificações que nunca chegaram e clientes que fecharam a página depois de pagar.
 */
export async function reconcilePendingPayments(limit = 50): Promise<{ checked: number; paid: number }> {
  const provider = paymentProvider();
  if (provider?.id !== "blackcat") return { checked: 0, paid: 0 };
  const since = new Date(Date.now() - 3 * 86_400_000);
  const pending = await prisma.payment.findMany({
    where: { provider: "blackcat", status: "pending", providerTransactionId: { not: null }, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let paid = 0;
  for (const payment of pending) {
    const updated = await checkPaymentRemote(payment, 0, "now");
    if (updated?.status === "paid") paid += 1;
    else if (payment.pixExpiresAt && payment.pixExpiresAt.getTime() <= Date.now()) {
      await prisma.payment.updateMany({ where: { id: payment.id, status: "pending" }, data: { status: "expired", statusDetail: "PIX expirado sem pagamento" } });
    }
  }
  return { checked: pending.length, paid };
}

/** Demonstração: simula a confirmação (ou o vencimento) do PIX em aberto. Só com DEMO_MODE. */
export async function simulateDemoPix(draftId: string, outcome: "paid" | "expired"): Promise<Payment | null> {
  if (!config.demoMode) return null;
  const payment = await prisma.payment.findFirst({ where: { draftId, provider: "demo", isDemo: true, status: "pending" }, orderBy: { createdAt: "desc" } });
  if (!payment) return null;
  return applyProviderTransaction(
    payment.id,
    {
      status: outcome,
      providerStatus: outcome.toUpperCase(),
      paymentMethod: "pix",
      amountCents: decimalToCents(payment.amount),
      paidAt: outcome === "paid" ? new Date() : null,
      audit: { demo: true },
    },
    { source: "demonstração", finalize: "now" },
  );
}
