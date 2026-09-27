import { Prisma } from "@prisma/client";
import { addBusinessDays } from "@/lib/business-days";
import { PAYMENT_NOTICE, SERVICE_TERMS_CHECKBOX, SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { prisma } from "@/lib/db";
import { AUTO_APPROVAL_NOTE } from "@/lib/documents/pre-analysis";
import { runPreAnalysis } from "@/lib/documents/pre-analysis-run";
import { config } from "@/lib/env";
import { centsToDecimal, normalizePhoneBR } from "@/lib/format";
import { COMMITMENT_VERSION, commitmentText } from "@/lib/options";
import { paymentMethodLabel } from "@/lib/payments/types";
import { generateProtocol } from "@/lib/protocol";
import { getStorage } from "@/lib/storage";
import { resolvePlatforms } from "./platforms";
import type { SubmissionData } from "./submission";

export class SubmissionError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

/** Perda declarada = depósitos − saques − saldo. Resultado negativo vira zero e é sinalizado. */
export function computeDeclaredLoss(depositsCents: number, withdrawalsCents: number, balanceCents: number) {
  const raw = depositsCents - withdrawalsCents - balanceCents;
  return { raw, loss: Math.max(0, raw), needsReview: raw < 0 };
}

/** O rascunho tem o CPF e um ComprovaBet válido? (exigido para pagar e para enviar). */
export async function assertDraftReady(draftId: string): Promise<void> {
  const draft = await prisma.caseDraft.findUnique({ where: { id: draftId }, select: { cpf: true } });
  if (!draft?.cpf) throw new SubmissionError("Informe seu CPF para continuar.", "cpf");
  const ok = await prisma.document.count({
    where: { draftId, category: "comprovabet", OR: [{ cpfCheck: null }, { cpfCheck: { not: "mismatch" } }] },
  });
  if (!ok) throw new SubmissionError("Envie o seu ComprovaBet para continuar.", "documents");
}

export async function submitCase(params: {
  draftId: string;
  isDemo: boolean;
  data: SubmissionData;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ caseId: string; protocol: string }> {
  const { data, draftId, isDemo } = params;
  const { platforms, aliases } = resolvePlatforms(data);
  if (!platforms.length) throw new SubmissionError("Selecione ao menos uma plataforma.", "platforms");

  // O CPF vem do rascunho (registrado antes do envio do ComprovaBet e usado na conferência do documento).
  const draft = await prisma.caseDraft.findUnique({
    where: { id: draftId },
    select: { cpf: true, termsAcceptedAt: true, termsVersion: true, termsIp: true, termsUserAgent: true },
  });
  const cpf = draft?.cpf ?? null;
  if (!cpf) throw new SubmissionError("Informe seu CPF para continuar.", "cpf");

  // A análise é paga antes da solicitação: sem pagamento aprovado (e o aceite das condições), não há envio.
  const payment = await prisma.payment.findFirst({ where: { draftId, status: "approved" }, orderBy: { paidAt: "desc" } });
  if (!payment) throw new SubmissionError("Conclua o pagamento para solicitar a análise.", "payment");
  if (!draft?.termsAcceptedAt) throw new SubmissionError("Aceite as condições do serviço na tela de pagamento.", "payment");
  const termsAcceptedAt: Date = draft.termsAcceptedAt;
  const paidAt = payment.paidAt ?? new Date();
  const paymentReference = [
    payment.provider === "mercadopago" ? "Mercado Pago" : "Pagamento de demonstração",
    paymentMethodLabel(payment.method),
    payment.providerPaymentId ?? payment.id,
  ].join(" · ");

  const draftDocs = await prisma.document.findMany({
    where: { draftId },
    select: { id: true, platformName: true, storageKey: true, category: true, cpfCheck: true },
  });
  const comprovabet = draftDocs.filter((d) => d.category === "comprovabet" && d.cpfCheck !== "mismatch");
  if (!comprovabet.length) throw new SubmissionError("Envie o seu ComprovaBet para continuar.", "documents");
  // Históricos por plataforma enviados antes da mudança para o ComprovaBet continuam aceitos como complemento.
  const attach = draftDocs.filter(
    (d) => comprovabet.includes(d) || (d.category !== "comprovabet" && d.platformName && aliases.has(d.platformName.toLowerCase())),
  );
  const orphans = draftDocs.filter((d) => !attach.includes(d));

  const phone = normalizePhoneBR(data.whatsapp);
  if (!phone) throw new SubmissionError("Informe um WhatsApp válido com DDD.", "whatsapp");
  const balance = data.hasBalance ? (data.balanceCents ?? 0) : 0;
  const declared = computeDeclaredLoss(data.depositsCents, data.withdrawalsCents, balance);

  // Pré-análise automática com os arquivos atuais. Aprovada: os arquivos conferidos entram aprovados e o caso já
  // fica pronto para a análise. Sem ela (ou com pendência), a validação documental fica com a equipe — o pagamento
  // já foi feito, então o envio nunca é recusado aqui.
  const pre = await runPreAnalysis(draftId, data).catch((error) => {
    console.error("[cases] falha na pré-análise no envio", error instanceof Error ? error.message : "erro desconhecido");
    return null;
  });
  const autoApproved = pre?.status === "approved";
  const autoApprovedIds = new Set(autoApproved ? pre.approvedIds : []);

  const now = new Date();
  // Prazo em dias úteis a partir do envio (feito com o pagamento confirmado).
  const reviewDeadline = addBusinessDays(now, config.reviewDays);

  for (let attempt = 0; attempt < 5; attempt++) {
    const protocol = generateProtocol(isDemo);
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          // Trava o rascunho: impede dois envios simultâneos da mesma solicitação.
          const claimed = await tx.caseDraft.updateMany({ where: { id: draftId, submittedAt: null }, data: { submittedAt: now } });
          if (claimed.count !== 1) throw new SubmissionError("Esta solicitação já foi enviada.", "draft");

          const existingUser = await tx.user.findFirst({
            where: { email: data.email, whatsapp: phone, fullName: data.fullName, cpf, isDemo },
            select: { id: true },
          });
          const user =
            existingUser ??
            (await tx.user.create({
              data: { fullName: data.fullName, cpf, email: data.email, whatsapp: phone, isAdult: true, isDemo },
              select: { id: true },
            }));

          const slugToId = new Map<string, string>();
          for (const p of platforms) {
            const row = await tx.bettingPlatform.upsert({
              where: { slug: p.slug },
              update: {},
              create: { slug: p.slug, name: p.name, isCustom: p.isCustom },
              select: { id: true },
            });
            slugToId.set(p.slug, row.id);
          }

          const caseRow = await tx.case.create({
            data: {
              protocol,
              createdAt: now,
              userId: user.id,
              betType: data.betType,
              sportsBetKind: data.betType === "sports" ? data.sportsKind : null,
              casinoGames: data.betType === "casino" ? data.casinoGames : [],
              mainLossArea: data.betType === "both" ? data.mainLossArea : null,
              period: data.period,
              controlLoss: data.controlLoss,
              situations: data.situations,
              situationOther: data.situations.includes("other") ? data.situationOther : null,
              declaredDeposits: centsToDecimal(data.depositsCents),
              declaredWithdrawals: centsToDecimal(data.withdrawalsCents),
              declaredBalance: centsToDecimal(balance),
              declaredLoss: centsToDecimal(declared.loss),
              declaredNeedsReview: declared.needsReview,
              status: autoApproved ? "payment_confirmed" : "documents_received",
              paymentStatus: "confirmed",
              paymentConfirmedAt: paidAt,
              paymentReference,
              preAnalysis: pre ? (pre as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
              privacyConsentAt: now,
              privacyConsentIp: params.ip,
              isDemo,
              reviewDeadline,
              platforms: { create: [...slugToId.values()].map((platformId) => ({ platformId })) },
              declarations: {
                create: {
                  deposits: centsToDecimal(data.depositsCents),
                  withdrawals: centsToDecimal(data.withdrawalsCents),
                  hasBalance: data.hasBalance,
                  balance: centsToDecimal(balance),
                  rawResult: centsToDecimal(declared.raw),
                  calculatedLoss: centsToDecimal(declared.loss),
                  needsReview: declared.needsReview,
                },
              },
              agreements: {
                create: {
                  accepted: true,
                  acceptedAt: termsAcceptedAt,
                  termsVersion: draft.termsVersion ?? SERVICE_TERMS_VERSION,
                  text: `Importante: ${PAYMENT_NOTICE}\n\n${SERVICE_TERMS_CHECKBOX}`,
                  ip: draft.termsIp,
                  userAgent: draft.termsUserAgent,
                },
              },
              commitment: {
                create: {
                  accepted: true,
                  acceptedAt: now,
                  ip: params.ip,
                  userAgent: params.userAgent,
                  textVersion: COMMITMENT_VERSION,
                  text: commitmentText(config.reviewDays),
                },
              },
              statusHistory: {
                create: [
                  { toStatus: "submitted", createdAt: now },
                  { fromStatus: "submitted", toStatus: "documents_received", createdAt: new Date(now.getTime() + 1000) },
                  // Documento aprovado na pré-análise automática: validação documental concluída.
                  ...(autoApproved
                    ? [{ fromStatus: "documents_received" as const, toStatus: "payment_confirmed" as const, createdAt: new Date(now.getTime() + 2000) }]
                    : []),
                ],
              },
            },
            select: { id: true },
          });

          for (const doc of attach) {
            const slug = aliases.get((doc.platformName ?? "").toLowerCase());
            await tx.document.update({
              where: { id: doc.id },
              data: {
                caseId: caseRow.id,
                draftId: null,
                platformId: slug ? (slugToId.get(slug) ?? null) : null,
                // Só os arquivos que passaram nas conferências automáticas; os demais ficam para a equipe.
                ...(autoApprovedIds.has(doc.id) ? { status: "valid" as const, reviewedAt: now, reviewNote: AUTO_APPROVAL_NOTE } : {}),
              },
            });
          }
          // Todas as tentativas de pagamento do rascunho (inclusive recusadas) ficam no histórico do caso.
          await tx.payment.updateMany({ where: { draftId }, data: { caseId: caseRow.id } });
          // O CPF e as respostas passam a existir só no caso; o rascunho não guarda cópia.
          await tx.caseDraft.update({ where: { id: draftId }, data: { caseId: caseRow.id, cpf: null, answers: Prisma.DbNull } });
          return caseRow;
        },
        { timeout: 20_000 },
      );

      // Arquivos de plataformas desmarcadas não seguem com o caso: são excluídos.
      if (orphans.length) {
        await prisma.document.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
        const storage = await getStorage();
        for (const o of orphans) await storage.remove(o.storageKey).catch(() => undefined);
      }
      return { caseId: created.id, protocol };
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? String(error.meta?.target ?? "") : "";
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && target.includes("protocol")) continue;
      throw error;
    }
  }
  throw new Error("Não foi possível gerar um protocolo único. Tente novamente.");
}
