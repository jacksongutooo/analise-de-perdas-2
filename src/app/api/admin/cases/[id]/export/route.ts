import { logAccess } from "@/lib/audit";
import { getAdmin } from "@/lib/auth/admin";
import { demoScope } from "@/lib/cases/admin-queries";
import { formatCpf } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { contentDisposition } from "@/lib/files/names";
import { decimalToCents } from "@/lib/format";
import { PRE_ANALYSIS_STATUS_LABEL, PRE_CHECK_LABEL, parsePreAnalysis } from "@/lib/documents/pre-analysis";
import { paymentMethodLabel, providerLabel } from "@/lib/payments";
import {
  BET_TYPE_SUMMARY,
  CASINO_GAMES,
  CONTROL_LOSS_SUMMARY,
  DOC_CATEGORIES,
  MAIN_LOSS_AREAS,
  PERIODS,
  REQUEST_REASONS,
  SITUATIONS,
  SPORTS_KINDS,
  labelFor,
} from "@/lib/options";
import { clientIp, userAgent } from "@/lib/security";
import { site } from "@/lib/site";
import {
  CASE_STATUS_LABEL,
  CPF_CHECK_LABEL,
  DOCUMENT_STATUS_LABEL,
  PAYMENT_ATTEMPT_LABEL,
  PAYMENT_STATUS_LABEL,
  type CaseStatusValue,
  type CpfCheckValue,
  type DocumentStatusValue,
  type PaymentStatusValue,
} from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reais = (value: { toString(): string } | null) => {
  const cents = decimalToCents(value);
  return cents === null ? null : cents / 100;
};

/**
 * Exporta os dados pessoais do titular (art. 18 da LGPD: acesso e portabilidade).
 * Notas internas e registros de conferência da equipe não fazem parte da exportação.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return new Response("Acesso restrito.", { status: 401 });
  const { id } = await params;
  const c = await prisma.case.findFirst({
    where: { id, ...demoScope() },
    include: {
      user: true,
      platforms: { include: { platform: true } },
      commitment: true,
      agreements: { orderBy: { acceptedAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      requests: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) return new Response("Caso não encontrado.", { status: 404 });

  const detail =
    c.betType === "sports"
      ? labelFor(SPORTS_KINDS, c.sportsBetKind)
      : c.betType === "casino"
        ? c.casinoGames.map((g) => labelFor(CASINO_GAMES, g))
        : labelFor(MAIN_LOSS_AREAS, c.mainLossArea);

  const data = {
    geradoEm: new Date().toISOString(),
    controlador: site.legalName || site.name,
    protocolo: c.protocol,
    titular: {
      nome: c.user.fullName,
      cpf: c.user.cpf ? formatCpf(c.user.cpf) : null,
      email: c.user.email,
      whatsapp: c.user.whatsapp,
      declarouMaioridade: c.user.isAdult,
    },
    solicitacao: {
      enviadaEm: c.createdAt.toISOString(),
      prazoEstimado: c.reviewDeadline.toISOString(),
      statusAtual: CASE_STATUS_LABEL[c.status as CaseStatusValue],
      pagamento: {
        situacao: PAYMENT_STATUS_LABEL[c.paymentStatus as PaymentStatusValue],
        confirmadoEm: c.paymentConfirmedAt?.toISOString() ?? null,
        transacoes: c.payments.map((p) => ({
          provedor: providerLabel(p.provider),
          forma: paymentMethodLabel(p.paymentMethod),
          situacao: PAYMENT_ATTEMPT_LABEL[p.status],
          valor: reais(p.amount),
          transacao: p.providerTransactionId,
          referenciaInterna: p.externalReference,
          iniciadaEm: p.createdAt.toISOString(),
          pagaEm: p.paidAt?.toISOString() ?? null,
        })),
      },
      tipo: BET_TYPE_SUMMARY[c.betType],
      detalhe: detail,
      plataformas: c.platforms.map((p) => p.platform.name),
      tempoDeUso: labelFor(PERIODS, c.period),
      controleDasApostas: c.controlLoss ? CONTROL_LOSS_SUMMARY[c.controlLoss] : null,
      preAnaliseAutomatica: (() => {
        const pre = parsePreAnalysis(c.preAnalysis);
        return pre
          ? {
              resultado: PRE_ANALYSIS_STATUS_LABEL[pre.status],
              feitaEm: pre.analyzedAt,
              conferencias: pre.checks.map((check) => ({ item: PRE_CHECK_LABEL[check.key], resultado: check.detail })),
            }
          : null;
      })(),
      situacoes: c.situations.map((s) => labelFor(SITUATIONS, s)),
      situacaoDescrita: c.situationOther,
    },
    valoresEmReais: {
      depositosInformados: reais(c.declaredDeposits),
      saquesInformados: reais(c.declaredWithdrawals),
      saldoInformado: reais(c.declaredBalance),
      perdaDeclarada: reais(c.declaredLoss),
      valorIdentificadoConferido: c.identifiedSource === "manual" ? reais(c.identifiedLoss) : null,
      valorValidado: reais(c.validatedLoss),
    },
    consentimentos: {
      tratamentoDeDados: { em: c.privacyConsentAt.toISOString(), ip: c.privacyConsentIp },
      compromissoVoluntario: c.commitment
        ? {
            aceito: c.commitment.accepted,
            em: c.commitment.acceptedAt.toISOString(),
            ip: c.commitment.ip,
            navegador: c.commitment.userAgent,
            versaoDoTexto: c.commitment.textVersion,
            texto: c.commitment.text,
          }
        : null,
      condicoesDoServico: c.agreements.map((a) => ({
        aceito: a.accepted,
        em: a.acceptedAt.toISOString(),
        ip: a.ip,
        navegador: a.userAgent,
        versaoDoTexto: a.termsVersion,
        texto: a.text,
      })),
    },
    andamento: c.statusHistory.map((h) => ({
      status: CASE_STATUS_LABEL[h.toStatus as CaseStatusValue],
      em: h.createdAt.toISOString(),
      mensagem: h.publicMessage,
    })),
    pedidosDeDocumentos: c.requests.map((r) => ({
      em: r.createdAt.toISOString(),
      motivos: r.reasons.map((reason) => labelFor(REQUEST_REASONS, reason)),
      mensagem: r.message,
      situacao: r.status,
    })),
    documentosEnviados: c.documents.map((d) => ({
      nome: d.originalName,
      tipo: DOC_CATEGORIES.find((cat) => cat.value === d.category)?.label ?? d.category,
      plataforma: d.platformName,
      tamanhoEmBytes: d.sizeBytes,
      enviadoEm: d.createdAt.toISOString(),
      situacao: DOCUMENT_STATUS_LABEL[d.status as DocumentStatusValue],
      ...(d.category === "comprovabet"
        ? {
            anoDeReferencia: d.referenceYear,
            conferenciaDoCpf: d.cpfCheck ? CPF_CHECK_LABEL[d.cpfCheck as CpfCheckValue] : null,
          }
        : {}),
    })),
    observacao: "Os arquivos enviados podem ser entregues individualmente pelo botão Visualizar do painel.",
  };

  await logAccess({
    action: "case.export",
    adminId: admin.id,
    subject: c.protocol,
    targetType: "case",
    targetId: c.id,
    ip: clientIp(req.headers),
    userAgent: userAgent(req.headers),
  });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": contentDisposition("attachment", `dados-${c.protocol}.json`),
      "Cache-Control": "no-store",
    },
  });
}
