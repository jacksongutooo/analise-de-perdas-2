import { SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { maskCpf } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { decimalToCents } from "@/lib/format";
import {
  clientCpfLabel,
  clientDocumentLabel,
  type CaseStatusValue,
  type CpfCheckValue,
  type DocumentStatusValue,
  type PaymentStatusValue,
} from "@/lib/status";

/**
 * Dados mínimos exibidos ao solicitante. Valores automáticos não conferidos, notas internas,
 * detalhes da conferência de CPF e o CPF completo NÃO aparecem aqui.
 */
export async function loadClientCase(caseId: string) {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      protocol: true,
      status: true,
      paymentStatus: true,
      paymentConfirmedAt: true,
      isDemo: true,
      createdAt: true,
      reviewDeadline: true,
      declaredLoss: true,
      identifiedLoss: true,
      identifiedSource: true,
      validatedLoss: true,
      nextSteps: true,
      user: { select: { cpf: true } },
      platforms: { select: { platform: { select: { name: true } } } },
      _count: { select: { documents: true } },
      documents: {
        where: { category: "comprovabet" },
        orderBy: { createdAt: "asc" },
        select: { id: true, originalName: true, status: true, cpfCheck: true, createdAt: true, reviewedAt: true },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: { toStatus: true, fromStatus: true, createdAt: true, publicMessage: true },
      },
      requests: {
        where: { status: "open" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, reasons: true, message: true, createdAt: true },
      },
      agreements: {
        where: { termsVersion: SERVICE_TERMS_VERSION, accepted: true },
        orderBy: { acceptedAt: "desc" },
        take: 1,
        select: { acceptedAt: true },
      },
    },
  });
  if (!c || c.isDemo !== config.demoMode) return null;
  const latestMessage = [...c.statusHistory].reverse().find((h) => h.publicMessage)?.publicMessage ?? null;
  const comprovabet = c.documents.map((d) => {
    const status = d.status as DocumentStatusValue;
    return {
      id: d.id,
      name: d.originalName,
      sentAt: d.createdAt,
      reviewedAt: d.reviewedAt,
      status,
      ...clientDocumentLabel(status),
      cpf: clientCpfLabel(status, d.cpfCheck as CpfCheckValue),
    };
  });
  const current = comprovabet[comprovabet.length - 1] ?? null;
  const approved = [...comprovabet].reverse().find((d) => d.status === "valid") ?? null;
  const approvedAt = approved ? (approved.reviewedAt ?? approved.sentAt) : null;
  return {
    id: c.id,
    protocol: c.protocol,
    status: c.status as CaseStatusValue,
    paymentStatus: c.paymentStatus as PaymentStatusValue,
    paymentConfirmedAt: c.paymentConfirmedAt,
    createdAt: c.createdAt,
    reviewDeadline: c.reviewDeadline,
    cpfMasked: c.user.cpf ? maskCpf(c.user.cpf) : null,
    declaredLossCents: decimalToCents(c.declaredLoss) ?? 0,
    identifiedLossCents: c.identifiedSource === "manual" ? decimalToCents(c.identifiedLoss) : null,
    validatedLossCents: decimalToCents(c.validatedLoss),
    nextSteps: c.nextSteps,
    platforms: c.platforms.map((p) => p.platform.name),
    documentsCount: c._count.documents,
    hasComprovaBet: comprovabet.length > 0,
    /** Arquivos do ComprovaBet (o último é o mais recente). */
    documents: comprovabet,
    document: current,
    documentSentAt: comprovabet[0]?.sentAt ?? null,
    documentApprovedAt: approvedAt,
    termsAcceptedAt: c.agreements[0]?.acceptedAt ?? null,
    history: c.statusHistory.map((h) => ({ toStatus: h.toStatus as string, fromStatus: h.fromStatus as string | null, createdAt: h.createdAt })),
    latestMessage,
    openRequest: c.requests[0] ?? null,
  };
}

export type ClientCase = NonNullable<Awaited<ReturnType<typeof loadClientCase>>>;
