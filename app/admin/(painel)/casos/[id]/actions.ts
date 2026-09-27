"use server";

import type { CaseStatus, DocumentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/admin";
import { addBusinessDays } from "@/lib/business-days";
import { demoScope } from "@/lib/cases/admin-queries";
import { CPF_MISMATCH_MESSAGE } from "@/lib/comprovabet";
import { formatCpf, normalizeCpf } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { recheckComprovaBetCpf } from "@/lib/documents/recheck";
import { config } from "@/lib/env";
import { processDocument, recomputeCaseIdentified } from "@/lib/extraction/process";
import { centsToDecimal } from "@/lib/format";
import { REQUEST_REASON_VALUES } from "@/lib/options";
import { clientIp, userAgent } from "@/lib/security";
import { getStorage } from "@/lib/storage";
import { ADMIN_SETTABLE_STATUSES, CPF_LOCKED_STATUSES, DOCUMENT_AWAITING_REVIEW, isDocumentStatus, type CaseStatusValue } from "@/lib/status";

// Todas as ações exigem sessão administrativa e respeitam a separação demo × produção.

const MAX_CENTS = 9_999_999_999;

async function scopedCase(caseId: string) {
  const c = await prisma.case.findFirst({
    where: { id: caseId, ...demoScope() },
    select: { id: true, status: true, paymentStatus: true, identifiedLoss: true, identifiedSource: true, userId: true },
  });
  if (!c) throw new Error("Caso não encontrado.");
  return c;
}

/** Registra a mudança de etapa do caso no histórico (visível ao cliente na linha do tempo). */
function transition(caseId: string, from: CaseStatus, to: CaseStatus, adminId: string, publicMessage: string | null = null) {
  return [
    prisma.case.update({ where: { id: caseId }, data: { status: to } }),
    prisma.statusHistory.create({ data: { caseId, fromStatus: from, toStatus: to, changedById: adminId, publicMessage } }),
  ];
}

function back(caseId: string, query: string, anchor: string): never {
  revalidatePath(`/admin/casos/${caseId}`);
  revalidatePath("/admin/casos");
  revalidatePath("/admin");
  redirect(`/admin/casos/${caseId}?${query}#${anchor}`);
}

function text(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

function cents(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS ? n : Number.NaN;
}

export async function updateStatus(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  const status = String(formData.get("status") ?? "") as CaseStatusValue;
  if (!ADMIN_SETTABLE_STATUSES.includes(status)) back(caseId, "erro=status", "status");
  const message = text(formData, "publicMessage", 1000) || null;
  if (status === c.status && !message) back(caseId, "ok=status", "status");

  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data: { status } }),
    prisma.statusHistory.create({ data: { caseId, fromStatus: c.status, toStatus: status, changedById: admin.id, publicMessage: message } }),
    // Ao sair de "documentação adicional", pedidos em aberto são encerrados.
    prisma.documentRequest.updateMany({ where: { caseId, status: "open" }, data: { status: "cancelled" } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: `status:${status}`, comment: message } }),
  ]);
  back(caseId, "ok=status", "status");
}

export async function assignCase(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const target = String(formData.get("adminId") ?? "");
  let assignedAdminId: string | null = null;
  if (target) {
    const found = await prisma.adminUser.findFirst({
      where: { id: target, isActive: true, ...(config.demoMode ? {} : { isDemo: false }) },
      select: { id: true },
    });
    if (!found) back(caseId, "erro=assign", "topo");
    assignedAdminId = found.id;
  }
  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data: { assignedAdminId } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "assign", comment: assignedAdminId ?? "sem responsável" } }),
  ]);
  back(caseId, "ok=assign", "topo");
}

export async function addNote(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const content = text(formData, "content", 4000);
  if (!content) back(caseId, "erro=note", "notas");
  await prisma.caseNote.create({ data: { caseId, adminId: admin.id, content } });
  back(caseId, "ok=note", "notas");
}

export async function setDocumentStatus(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const documentId = String(formData.get("documentId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isDocumentStatus(status)) back(caseId, "erro=doc", "documentos");
  const doc = await prisma.document.findFirst({ where: { id: documentId, caseId }, select: { id: true, category: true, cpfCheck: true } });
  if (!doc) back(caseId, "erro=doc", "documentos");
  // ComprovaBet só é aprovado pela ação "Aprovar documento", que exige o CPF conferido.
  if (status === "valid" && doc.category === "comprovabet" && doc.cpfCheck !== "match" && doc.cpfCheck !== "manual_match") {
    back(caseId, doc.cpfCheck === "mismatch" ? "erro=cpf_block" : "erro=cpf_confirm", `doc-${doc.id}`);
  }
  if (status === "valid" && doc.category === "comprovabet") return approveDocument(caseId, formData);
  const note = text(formData, "reviewNote", 500);
  await prisma.$transaction([
    prisma.document.update({
      where: { id: doc.id },
      data: { status, reviewedAt: new Date(), reviewedById: admin.id, ...(note ? { reviewNote: note } : {}) },
    }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: `document:${status}`, comment: doc.id } }),
  ]);
  await recomputeCaseIdentified(caseId);
  back(caseId, "ok=doc", `doc-${doc.id}`);
}

export async function reprocessDocument(caseId: string, formData: FormData) {
  await requireAdmin();
  await scopedCase(caseId);
  const documentId = String(formData.get("documentId") ?? "");
  const doc = await prisma.document.findFirst({ where: { id: documentId, caseId }, select: { id: true, category: true } });
  if (!doc) back(caseId, "erro=doc", "documentos");
  await processDocument(doc.id);
  if (doc.category === "comprovabet") await recheckComprovaBetCpf(doc.id);
  await recomputeCaseIdentified(caseId);
  back(caseId, "ok=reprocess", `doc-${doc.id}`);
}

export async function requestDocuments(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  const reasons = formData
    .getAll("reasons")
    .map(String)
    .filter((r) => (REQUEST_REASON_VALUES as readonly string[]).includes(r));
  const message = text(formData, "message", 1000) || null;
  if (!reasons.length) back(caseId, "erro=reasons", "solicitar");
  if (reasons.includes("other") && !message) back(caseId, "erro=reason_message", "solicitar");

  await prisma.$transaction([
    prisma.documentRequest.updateMany({ where: { caseId, status: "open" }, data: { status: "cancelled" } }),
    prisma.documentRequest.create({ data: { caseId, reasons: [...new Set(reasons)], message, requestedById: admin.id } }),
    prisma.case.update({ where: { id: caseId }, data: { status: "additional_documents" } }),
    prisma.statusHistory.create({ data: { caseId, fromStatus: c.status, toStatus: "additional_documents", changedById: admin.id } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "request_documents", comment: reasons.join(", ") } }),
  ]);
  back(caseId, "ok=request", "solicitar");
}

export async function saveIdentified(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const deposits = cents(formData, "deposits");
  const withdrawals = cents(formData, "withdrawals") ?? 0;
  const balance = cents(formData, "balance") ?? 0;
  if (deposits === null || [deposits, withdrawals, balance].some(Number.isNaN)) back(caseId, "erro=value", "valores");
  const loss = Math.max(0, deposits - withdrawals - balance);
  const comment = text(formData, "comment", 500) || null;
  await prisma.$transaction([
    prisma.case.update({
      where: { id: caseId },
      data: {
        identifiedDeposits: centsToDecimal(deposits),
        identifiedWithdrawals: centsToDecimal(withdrawals),
        identifiedBalance: centsToDecimal(balance),
        identifiedLoss: centsToDecimal(loss),
        identifiedSource: "manual",
      },
    }),
    prisma.caseReview.create({
      data: {
        caseId,
        adminId: admin.id,
        action: "identified_manual",
        identifiedDeposits: centsToDecimal(deposits),
        identifiedWithdrawals: centsToDecimal(withdrawals),
        identifiedBalance: centsToDecimal(balance),
        identifiedLoss: centsToDecimal(loss),
        comment,
      },
    }),
  ]);
  back(caseId, "ok=identified", "valores");
}

export async function confirmIdentified(caseId: string) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  if (c.identifiedLoss === null) back(caseId, "erro=value", "valores");
  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data: { identifiedSource: "manual" } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "identified_confirmed", identifiedLoss: c.identifiedLoss } }),
  ]);
  back(caseId, "ok=confirmed", "valores");
}

export async function recalcIdentified(caseId: string) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  await recomputeCaseIdentified(caseId, { force: true });
  await prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "identified_recalculated" } });
  back(caseId, "ok=recalc", "valores");
}

export async function saveValidated(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const value = cents(formData, "validated");
  if (value === null || Number.isNaN(value)) back(caseId, "erro=value", "valores");
  const comment = text(formData, "comment", 500) || null;
  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data: { validatedLoss: centsToDecimal(value) } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "validated", validatedLoss: centsToDecimal(value), comment } }),
  ]);
  back(caseId, "ok=validated", "valores");
}

export async function clearValidated(caseId: string) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data: { validatedLoss: null } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "validated_cleared" } }),
  ]);
  back(caseId, "ok=validated_clear", "valores");
}

export async function saveNextSteps(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const nextSteps = text(formData, "nextSteps", 2000) || null;
  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data: { nextSteps } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "next_steps" } }),
  ]);
  back(caseId, "ok=next", "proximos");
}

// ─── Ações rápidas do fluxo com o ComprovaBet ─────────────────────────────

async function caseDocument(caseId: string, formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const doc = await prisma.document.findFirst({
    where: { id: documentId, caseId },
    select: { id: true, category: true, status: true, cpfCheck: true },
  });
  if (!doc) back(caseId, "erro=doc", "documentos");
  return doc;
}

const cpfConfirmed = (check: string | null) => check === "match" || check === "manual_match";

/**
 * Aprovar documento. Para o ComprovaBet, exige o CPF compatível (leitura automática) ou a confirmação
 * da conferência manual no próprio diálogo; CPF divergente bloqueia a aprovação.
 * Os demais arquivos do mesmo ComprovaBet ainda em análise são aprovados junto (arquivos com problema
 * ou CPF divergente continuam como estão). Com o ComprovaBet aprovado, o caso fica pronto para a análise
 * (já paga, no fluxo atual) ou, nos casos antigos com pagamento pendente, segue para o pagamento.
 */
export async function approveDocument(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  const doc = await caseDocument(caseId, formData);
  const note = text(formData, "note", 500) || text(formData, "reviewNote", 500) || null;
  const isComprovaBet = doc.category === "comprovabet";
  const files: { id: string; cpfCheck: string | null }[] = [{ id: doc.id, cpfCheck: doc.cpfCheck }];
  if (isComprovaBet) {
    if (doc.cpfCheck === "mismatch") back(caseId, "erro=cpf_block", `doc-${doc.id}`);
    files.push(
      ...(await prisma.document.findMany({
        where: {
          caseId,
          category: "comprovabet",
          id: { not: doc.id },
          status: { in: [...DOCUMENT_AWAITING_REVIEW] },
          OR: [{ cpfCheck: null }, { cpfCheck: { not: "mismatch" } }],
        },
        select: { id: true, cpfCheck: true },
      })),
    );
    if (files.some((f) => !cpfConfirmed(f.cpfCheck)) && formData.get("confirmCpf") !== "yes") back(caseId, "erro=cpf_confirm", `doc-${doc.id}`);
  }

  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    ...files.map((f) =>
      prisma.document.update({
        where: { id: f.id },
        data: {
          status: "valid",
          reviewedAt: now,
          reviewedById: admin.id,
          ...(isComprovaBet && !cpfConfirmed(f.cpfCheck)
            ? { cpfCheck: "manual_match" as const, cpfCheckNote: `CPF conferido manualmente por ${admin.name}.`, cpfCheckedAt: now }
            : {}),
          ...(note && f.id === doc.id ? { reviewNote: note } : {}),
        },
      }),
    ),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "document:valid", comment: note ?? files.map((f) => f.id).join(", ") } }),
  ];
  if (isComprovaBet && ["submitted", "documents_received", "additional_documents"].includes(c.status)) {
    ops.push(prisma.documentRequest.updateMany({ where: { caseId, status: "open" }, data: { status: "fulfilled", fulfilledAt: new Date() } }));
    const analysisStarted = (await prisma.statusHistory.count({ where: { caseId, toStatus: "under_review" } })) > 0;
    const target: CaseStatus | null =
      c.paymentStatus === "pending" || c.paymentStatus === "awaiting_confirmation"
        ? "awaiting_payment"
        : c.paymentStatus === "confirmed"
          ? analysisStarted
            ? "under_review"
            : "payment_confirmed"
          : c.status === "additional_documents"
            ? "under_review"
            : null;
    if (target && target !== c.status) ops.push(...transition(caseId, c.status, target, admin.id));
  }
  await prisma.$transaction(ops);
  await recomputeCaseIdentified(caseId);
  back(caseId, "ok=approved", "resumo");
}

/**
 * Marca um problema no documento e pede a complementação ao cliente (a observação aparece para ele).
 * Usado por "CPF divergente", "Solicitar complemento" e "Documento inválido".
 */
async function flagDocument(caseId: string, formData: FormData, kind: "cpf_mismatch" | "complement" | "invalid") {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  const documentId = String(formData.get("documentId") ?? "");
  const doc = documentId ? await caseDocument(caseId, formData) : null;
  const reasons = [
    ...new Set(
      formData
        .getAll("reasons")
        .map(String)
        .filter((r) => (REQUEST_REASON_VALUES as readonly string[]).includes(r)),
    ),
  ];
  if (kind === "cpf_mismatch" && !reasons.includes("cpf_mismatch")) reasons.unshift("cpf_mismatch");
  const message = text(formData, "message", 1000) || (kind === "cpf_mismatch" ? CPF_MISMATCH_MESSAGE : null);
  const anchor = doc ? `doc-${doc.id}` : "resumo";
  if (!reasons.length) back(caseId, "erro=reasons", anchor);
  if (!message) back(caseId, "erro=message", anchor);

  const docStatus: DocumentStatus = kind === "cpf_mismatch" ? "cpf_mismatch" : kind === "invalid" ? "invalid" : "complement_required";
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.documentRequest.updateMany({ where: { caseId, status: "open" }, data: { status: "cancelled" } }),
    prisma.documentRequest.create({ data: { caseId, reasons, message, requestedById: admin.id } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: `document:${docStatus}`, comment: reasons.join(", ") } }),
  ];
  if (doc) {
    ops.push(
      prisma.document.update({
        where: { id: doc.id },
        data: {
          status: docStatus,
          reviewedAt: new Date(),
          reviewedById: admin.id,
          ...(kind === "cpf_mismatch"
            ? { cpfCheck: "mismatch" as const, cpfCheckNote: `CPF divergente marcado por ${admin.name}.`, cpfCheckedAt: new Date() }
            : {}),
        },
      }),
    );
  }
  if (c.status !== "additional_documents") ops.push(...transition(caseId, c.status, "additional_documents", admin.id));
  await prisma.$transaction(ops);
  await recomputeCaseIdentified(caseId);
  back(caseId, `ok=${kind}`, "resumo");
}

export async function markCpfMismatch(caseId: string, formData: FormData) {
  await flagDocument(caseId, formData, "cpf_mismatch");
}

export async function requestComplement(caseId: string, formData: FormData) {
  await flagDocument(caseId, formData, "complement");
}

export async function markDocumentInvalid(caseId: string, formData: FormData) {
  await flagDocument(caseId, formData, "invalid");
}

/** Conferência manual do CPF (imagem, PDF digitalizado ou leitura automática contestada). */
export async function confirmCpfManually(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  await scopedCase(caseId);
  const doc = await caseDocument(caseId, formData);
  if (doc.category !== "comprovabet") back(caseId, "erro=doc", `doc-${doc.id}`);
  const note = text(formData, "note", 300);
  if (doc.cpfCheck === "mismatch" && !note) back(caseId, "erro=cpf_note", `doc-${doc.id}`);
  await prisma.$transaction([
    prisma.document.update({
      where: { id: doc.id },
      data: {
        cpfCheck: "manual_match",
        cpfCheckNote: `CPF conferido manualmente por ${admin.name}${note ? `: ${note}` : "."}`,
        cpfCheckedAt: new Date(),
        ...(doc.status === "cpf_mismatch" ? { status: "in_review" as const } : {}),
      },
    }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "cpf:manual_match", comment: note || null } }),
  ]);
  back(caseId, "ok=cpf_manual", `doc-${doc.id}`);
}

/** Confirmação do pagamento da análise pela equipe. O prazo estimado da análise passa a contar agora. */
export async function confirmPayment(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  if (c.status !== "awaiting_payment" || c.paymentStatus === "confirmed") back(caseId, "erro=payment", "pagamento");
  const reference = text(formData, "reference", 200) || null;
  const now = new Date();
  await prisma.$transaction([
    prisma.case.update({
      where: { id: caseId },
      data: {
        paymentStatus: "confirmed",
        paymentConfirmedAt: now,
        paymentConfirmedById: admin.id,
        paymentReference: reference,
        reviewDeadline: addBusinessDays(now, config.reviewDays),
      },
    }),
    ...transition(caseId, c.status, "payment_confirmed", admin.id),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "payment:confirmed", comment: reference } }),
  ]);
  const h = await headers();
  await logAccess({ action: "payment.confirmed", adminId: admin.id, targetType: "case", targetId: caseId, ip: clientIp(h), userAgent: userAgent(h) });
  back(caseId, "ok=payment", "pagamento");
}

/** Iniciar análise: depois da validação documental e do pagamento (casos antigos: sem pagamento). */
export async function startAnalysis(caseId: string) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  const legacyReady = c.paymentStatus === "not_applicable" && ["submitted", "documents_received"].includes(c.status);
  if (c.status !== "payment_confirmed" && !legacyReady) back(caseId, "erro=start", "resumo");
  await prisma.$transaction([
    ...transition(caseId, c.status, "under_review", admin.id),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "analysis:started" } }),
  ]);
  back(caseId, "ok=started", "resumo");
}

/** Concluir análise. Outros resultados continuam disponíveis em "Status do caso". */
export async function concludeAnalysis(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  const c = await scopedCase(caseId);
  if (c.status !== "under_review") back(caseId, "erro=conclude", "resumo");
  const message = text(formData, "publicMessage", 1000) || "Análise documental concluída.";
  await prisma.$transaction([
    ...transition(caseId, c.status, "completed", admin.id, message),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "analysis:completed", comment: message } }),
  ]);
  back(caseId, "ok=concluded", "resumo");
}

/**
 * Correção do CPF (ex.: erro de digitação), restrita a administradores e permitida só antes de a
 * análise documental avançar. Depois disso, o CPF fica travado para evitar alterações indevidas.
 * O CPF não é gravado em registros: só a ocorrência e o motivo.
 */
export async function correctCpf(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (admin.role !== "admin") back(caseId, "erro=role_cpf", "solicitante");
  const c = await scopedCase(caseId);
  const cpf = normalizeCpf(String(formData.get("cpf") ?? "").slice(0, 20));
  const reason = text(formData, "reason", 300);
  if (!cpf) back(caseId, "erro=cpf_invalid", "solicitante");
  if (!reason) back(caseId, "erro=cpf_reason", "solicitante");
  const locked = await prisma.case.count({
    where: {
      userId: c.userId,
      OR: [{ status: { in: [...CPF_LOCKED_STATUSES] } }, { documents: { some: { category: "comprovabet", status: "valid" } } }],
    },
  });
  if (locked) back(caseId, "erro=cpf_locked", "solicitante");

  await prisma.$transaction([
    prisma.user.update({ where: { id: c.userId }, data: { cpf } }),
    prisma.caseReview.create({ data: { caseId, adminId: admin.id, action: "cpf:corrected", comment: reason } }),
  ]);
  const docs = await prisma.document.findMany({ where: { category: "comprovabet", case: { userId: c.userId } }, select: { id: true } });
  for (const doc of docs) await recheckComprovaBetCpf(doc.id);
  const h = await headers();
  await logAccess({ action: "case.cpf_corrected", adminId: admin.id, targetType: "case", targetId: caseId, ip: clientIp(h), userAgent: userAgent(h) });
  back(caseId, "ok=cpf_corrected", "solicitante");
}

/** CPF completo, sob demanda, para a equipe autorizada. Cada visualização é registrada. */
export async function revealCpf(caseId: string): Promise<string | null> {
  const admin = await requireAdmin();
  const c = await prisma.case.findFirst({ where: { id: caseId, ...demoScope() }, select: { id: true, user: { select: { cpf: true } } } });
  if (!c?.user.cpf) return null;
  const h = await headers();
  await logAccess({ action: "case.cpf_view", adminId: admin.id, targetType: "case", targetId: c.id, ip: clientIp(h), userAgent: userAgent(h) });
  return formatCpf(c.user.cpf);
}

/**
 * Exclusão definitiva (pedido de eliminação do titular, art. 18 da LGPD).
 * Remove o caso, as respostas, os valores, as notas, os documentos e os arquivos do armazenamento.
 * Restrita a administradores e confirmada digitando o protocolo.
 * Os registros de acesso são mantidos pelo prazo legal (Marco Civil da Internet).
 */
export async function deleteCase(caseId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (admin.role !== "admin") back(caseId, "erro=role", "lgpd");
  const c = await prisma.case.findFirst({
    where: { id: caseId, ...demoScope() },
    select: { id: true, protocol: true, userId: true, documents: { select: { storageKey: true } } },
  });
  if (!c) throw new Error("Caso não encontrado.");
  const typed = text(formData, "confirmProtocol", 30).toUpperCase().replace(/\s+/g, "");
  if (typed !== c.protocol) back(caseId, "erro=confirm", "lgpd");

  const draftFiles = await prisma.document.findMany({ where: { draft: { caseId } }, select: { storageKey: true } });
  await prisma.$transaction(async (tx) => {
    await tx.document.deleteMany({ where: { draft: { caseId } } });
    await tx.caseDraft.deleteMany({ where: { caseId } });
    await tx.case.delete({ where: { id: caseId } });
    const otherCases = await tx.case.count({ where: { userId: c.userId } });
    if (otherCases === 0) await tx.user.delete({ where: { id: c.userId } });
  });

  const storage = await getStorage();
  for (const file of [...c.documents, ...draftFiles]) {
    await storage.remove(file.storageKey).catch((error) => console.error("[lgpd] falha ao remover arquivo", file.storageKey, error));
  }
  const h = await headers();
  await logAccess({
    action: "case.delete",
    adminId: admin.id,
    subject: c.protocol,
    targetType: "case",
    targetId: c.id,
    ip: clientIp(h),
    userAgent: userAgent(h),
  });
  revalidatePath("/admin/casos");
  revalidatePath("/admin");
  redirect(`/admin/casos?excluido=${encodeURIComponent(c.protocol)}`);
}
