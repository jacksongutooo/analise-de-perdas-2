import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { RevealCpf } from "@/components/admin/RevealCpf";
import { IconAlert, IconCheck, IconChevronLeft, IconClock, IconEye, IconRefresh } from "@/components/icons";
import { MoneyField } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Notice, Select, TextInput, Textarea, buttonClasses } from "@/components/ui";
import { logAccess } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/admin";
import { demoScope } from "@/lib/cases/admin-queries";
import { CPF_MISMATCH_MESSAGE, SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { contactState, deadlineDistance } from "@/lib/contact";
import { maskCpf } from "@/lib/cpf";
import { PRE_ANALYSIS_STATUS_LABEL, PRE_CHECK_LABEL, parsePreAnalysis } from "@/lib/documents/pre-analysis";
import { cx } from "@/lib/cx";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import type { ExtractionSummary } from "@/lib/extraction/process";
import { decimalToCents, formatBRL, formatBytes, formatDate, formatDateTime, formatPhoneBR, plural } from "@/lib/format";
import { paymentMethodLabel, providerLabel } from "@/lib/payments";
import {
  BET_TYPE_SUMMARY,
  CASINO_GAMES,
  COMPROVABET_REASON_VALUES,
  CONTACT_CHANNELS,
  CONTACT_PERIODS,
  CONTROL_LOSS_SUMMARY,
  DOC_CATEGORIES,
  EVIDENCE_OPTIONS,
  LOSS_RANGES,
  MAIN_LOSS_AREAS,
  PERIODS,
  REQUEST_REASONS,
  SITUATIONS,
  SPORTS_KINDS,
  labelFor,
  lostControl,
} from "@/lib/options";
import { clientIp, userAgent } from "@/lib/security";
import {
  ADMIN_SETTABLE_STATUSES,
  CASE_STATUS_LABEL,
  CASE_STATUS_TONE,
  CPF_CHECK_LABEL,
  CPF_CHECK_TONE,
  CPF_LOCKED_STATUSES,
  DOCUMENT_AWAITING_REVIEW,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  DOCUMENT_STATUS_VALUES,
  PAYMENT_ATTEMPT_LABEL,
  PAYMENT_ATTEMPT_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  divergenceOf,
  type CaseStatusValue,
  type CpfCheckValue,
  type DocumentStatusValue,
  type PaymentStatusValue,
} from "@/lib/status";
import {
  addNote,
  approveDocument,
  assignCase,
  clearValidated,
  concludeAnalysis,
  confirmCpfManually,
  confirmIdentified,
  confirmPayment,
  correctCpf,
  deleteCase,
  markContacted,
  markCpfMismatch,
  markDocumentInvalid,
  recalcIdentified,
  reprocessDocument,
  requestComplement,
  requestDocuments,
  revealCpf,
  saveIdentified,
  saveNextSteps,
  saveValidated,
  setDocumentStatus,
  startAnalysis,
  undoContacted,
  updateStatus,
} from "./actions";

export const dynamic = "force-dynamic";

const OK_MESSAGES: Record<string, string> = {
  status: "Status atualizado.",
  assign: "Responsável atualizado.",
  note: "Nota adicionada.",
  doc: "Documento atualizado.",
  reprocess: "Leitura automática refeita.",
  request: "Solicitação de documentos registrada. O cliente verá o pedido no acompanhamento.",
  identified: "Valor identificado salvo.",
  confirmed: "Valor identificado confirmado.",
  recalc: "Valor recalculado a partir dos documentos.",
  validated: "Valor validado salvo.",
  validated_clear: "Valor validado removido.",
  next: "Próximos passos salvos.",
  approved: "Documento aprovado. O cliente vê “Documento analisado” no acompanhamento.",
  cpf_mismatch: "CPF divergente registrado. O cliente foi orientado a enviar o documento correto.",
  complement: "Complementação solicitada. O cliente vê a observação no acompanhamento.",
  invalid: "Documento marcado como inválido e complementação solicitada ao cliente.",
  cpf_manual: "CPF conferido manualmente.",
  payment: "Pagamento confirmado. O prazo estimado da análise passou a contar agora.",
  started: "Análise iniciada. O cliente vê “Análise em andamento”.",
  concluded: "Análise concluída.",
  cpf_corrected: "CPF corrigido e ComprovaBet reconferido.",
  contacted: "Contato registrado. O cliente vê “Contato realizado” no acompanhamento.",
  contact_undone: "Registro do contato desfeito. O prazo do contato voltou a valer.",
};
const ERROR_MESSAGES: Record<string, string> = {
  status: "Status inválido.",
  assign: "Responsável inválido.",
  note: "Escreva o conteúdo da nota.",
  doc: "Documento não encontrado.",
  reasons: "Selecione ao menos um motivo.",
  reason_message: "Descreva o motivo “Outro” na mensagem.",
  value: "Informe um valor válido.",
  role: "Somente administradores podem excluir casos.",
  confirm: "O protocolo digitado não confere. Nada foi excluído.",
  message: "Escreva a observação para o cliente explicando o que precisa ser enviado.",
  cpf_block: "CPF divergente: o documento não pode ser aprovado. Se a leitura automática estiver errada, faça a conferência manual do CPF.",
  cpf_confirm: "Para aprovar o ComprovaBet, confirme que conferiu o CPF do documento.",
  cpf_note: "Explique a conferência manual: a leitura automática havia encontrado CPF divergente.",
  payment: "O pagamento só pode ser confirmado depois da aprovação do documento (etapa “Aguardando pagamento”).",
  start: "A análise começa depois da validação documental e do pagamento confirmado.",
  conclude: "Só é possível concluir uma análise em andamento.",
  role_cpf: "Somente administradores podem corrigir o CPF.",
  cpf_invalid: "CPF inválido. Nada foi alterado.",
  cpf_reason: "Informe o motivo da correção do CPF.",
  cpf_locked: "O CPF não pode mais ser alterado: a análise documental já avançou.",
  contact: "Este caso não tem prazo de primeiro contato (solicitação anterior ao formulário sem documento).",
};

function Section({ id, title, children, aside }: { id: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function ValueCard({ label, value, note, highlight }: { label: string; value: ReactNode; note?: ReactNode; highlight?: boolean }) {
  return (
    <div className={cx("rounded-xl border p-4", highlight ? "border-navy-900 bg-navy-50" : "border-line bg-paper/50")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <div className="mt-1.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

const categoryLabel = (value: string) => DOC_CATEGORIES.find((c) => c.value === value)?.label ?? value;

function ReasonChoices({ defaults = [] }: { defaults?: string[] }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">Motivo</legend>
      <div className="mt-2 grid gap-2">
        {COMPROVABET_REASON_VALUES.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="reasons" value={value} defaultChecked={defaults.includes(value)} className="size-4 accent-navy-900" />
            {labelFor(REQUEST_REASONS, value)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ClientMessage({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="block text-sm font-medium text-ink">
      Observação para o cliente
      <span className="block text-xs font-normal text-muted">Explique exatamente o que precisa ser enviado. Aparece no acompanhamento do cliente.</span>
      <Textarea name="message" required maxLength={1000} defaultValue={defaultValue} className="mt-1.5 min-h-24 text-sm" />
    </label>
  );
}

type ComprovaBetDoc = { id: string; status: string; cpfCheck: string | null };

/** Ações rápidas sobre um ComprovaBet, todas com diálogo de confirmação. */
function ComprovaBetActions({
  doc,
  caseId,
  cpfMasked,
  others,
  payment,
}: {
  doc: ComprovaBetDoc;
  caseId: string;
  cpfMasked: string;
  /** Outros arquivos do mesmo ComprovaBet ainda em análise: são aprovados junto. */
  others: { name: string; cpfCheck: string | null }[];
  /** Situação do pagamento do caso: define o que acontece depois da aprovação. */
  payment: PaymentStatusValue;
}) {
  const hidden = { documentId: doc.id };
  const confirmed = (check: string | null) => check === "match" || check === "manual_match";
  const cpfConfirmed = confirmed(doc.cpfCheck) && others.every((o) => confirmed(o.cpfCheck));
  return (
    <>
      <ConfirmDialog
        label="Aprovar documento"
        icon={<IconCheck size={15} strokeWidth={2.5} />}
        variant="ok"
        disabled={doc.status === "valid" || doc.cpfCheck === "mismatch"}
        disabledReason={doc.status === "valid" ? "Documento já aprovado." : "CPF divergente: faça a conferência manual antes de aprovar."}
        title="Aprovar o ComprovaBet?"
        confirmLabel="Aprovar documento"
        confirmVariant="ok"
        action={approveDocument.bind(null, caseId)}
        hidden={hidden}
        description={
          <>
            <p>
              O cliente verá “Documento analisado”
              {payment === "confirmed"
                ? " e o caso fica pronto para iniciar a análise (já paga)."
                : payment === "not_applicable"
                  ? "."
                  : " e o caso segue para o pagamento da análise."}
            </p>
            {doc.cpfCheck === "match" && <p className="font-medium text-ok-700">Leitura automática: CPF compatível.</p>}
            {others.length > 0 && (
              <p>
                Os outros arquivos do ComprovaBet em análise também serão aprovados: <span className="break-all">{others.map((o) => o.name).join(", ")}</span>.
              </p>
            )}
          </>
        }
      >
        {!cpfConfirmed && (
          <label className="flex items-start gap-2.5 rounded-xl border border-warn-700/25 bg-warn-50 p-3 text-sm text-ink">
            <input type="checkbox" name="confirmCpf" value="yes" required className="mt-0.5 size-4 shrink-0 accent-navy-900" />
            <span>
              Conferi manualmente que o CPF {others.length > 0 ? "dos arquivos" : "do documento"} corresponde ao CPF cadastrado ({cpfMasked}).
            </span>
          </label>
        )}
        <label className="block text-sm font-medium text-ink">
          Observação interna (opcional)
          <Textarea name="note" maxLength={500} className="mt-1.5 min-h-16 text-sm" />
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        label="CPF divergente"
        variant="danger"
        disabled={doc.status === "cpf_mismatch"}
        disabledReason="CPF divergente já registrado."
        title="Registrar CPF divergente?"
        confirmLabel="Registrar e avisar o cliente"
        confirmVariant="danger"
        action={markCpfMismatch.bind(null, caseId)}
        hidden={{ ...hidden, reasons: "cpf_mismatch" }}
        description={<p>O documento não poderá ser aprovado. O cliente será orientado a enviar o documento correto.</p>}
      >
        <ClientMessage defaultValue={CPF_MISMATCH_MESSAGE} />
      </ConfirmDialog>
      <ConfirmDialog
        label="Solicitar complemento"
        variant="secondary"
        title="Solicitar complementação?"
        confirmLabel="Solicitar ao cliente"
        action={requestComplement.bind(null, caseId)}
        hidden={hidden}
        description={<p>O cliente verá “Precisamos complementar sua documentação”, os motivos e a sua observação.</p>}
      >
        <ReasonChoices />
        <ClientMessage />
      </ConfirmDialog>
      <ConfirmDialog
        label="Documento inválido"
        variant="danger"
        disabled={doc.status === "invalid"}
        disabledReason="Documento já marcado como inválido."
        title="Marcar o documento como inválido?"
        confirmLabel="Marcar como inválido"
        confirmVariant="danger"
        action={markDocumentInvalid.bind(null, caseId)}
        hidden={hidden}
        description={<p>Use quando o arquivo não é um ComprovaBet, é de outro período ou não permite a análise. O cliente será orientado a enviar outro.</p>}
      >
        <ReasonChoices defaults={["not_comprovabet"]} />
        <ClientMessage />
      </ConfirmDialog>
    </>
  );
}

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; solicitar?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const c = await prisma.case.findFirst({
    where: { id, ...demoScope() },
    include: {
      user: true,
      assignedAdmin: { select: { id: true, name: true } },
      paymentConfirmedBy: { select: { name: true } },
      contactedBy: { select: { name: true } },
      agreements: { orderBy: { acceptedAt: "desc" }, take: 1 },
      payments: { orderBy: { createdAt: "desc" } },
      platforms: { include: { platform: true } },
      declarations: { orderBy: { createdAt: "desc" }, take: 1 },
      commitment: true,
      documents: {
        orderBy: { createdAt: "asc" },
        include: {
          reviewedBy: { select: { name: true } },
          _count: { select: { transactions: { where: { isDuplicate: true } } } },
        },
      },
      notes: { orderBy: { createdAt: "desc" }, include: { admin: { select: { name: true } } } },
      statusHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      requests: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { name: true } }, _count: { select: { documents: true } } } },
      reviews: { orderBy: { createdAt: "desc" }, take: 15, include: { admin: { select: { name: true } } } },
    },
  });
  if (!c) notFound();

  const h = await headers();
  await logAccess({ action: "case.view", adminId: admin.id, targetType: "case", targetId: c.id, ip: clientIp(h), userAgent: userAgent(h) });

  const admins = await prisma.adminUser.findMany({
    where: { isActive: true, ...(config.demoMode ? {} : { isDemo: false }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const status = c.status as CaseStatusValue;
  // Formulário sem documento: só a faixa de perda (sem valor exato declarado).
  const declared = decimalToCents(c.declaredLoss);
  const identified = decimalToCents(c.identifiedLoss);
  const validated = decimalToCents(c.validatedLoss);
  const divergence = declared === null ? null : divergenceOf(declared, identified);
  const intake = Boolean(c.contactDeadline);
  const contact = contactState(c.contactDeadline, c.contactedAt);
  const declaration = c.declarations[0];
  const openRequest = c.requests.find((r) => r.status === "open");
  const requestDoc = sp.solicitar ? c.documents.find((d) => d.id === sp.solicitar) : undefined;
  const bind = <A extends unknown[]>(fn: (caseId: string, ...args: A) => Promise<void>) => fn.bind(null, c.id);

  const detail =
    c.betType === "sports"
      ? labelFor(SPORTS_KINDS, c.sportsBetKind)
      : c.betType === "casino"
        ? c.casinoGames.map((g) => labelFor(CASINO_GAMES, g)).join(", ")
        : c.betType === "both"
          ? labelFor(MAIN_LOSS_AREAS, c.mainLossArea)
          : "";

  const payment = c.paymentStatus as PaymentStatusValue;
  const legacy = payment === "not_applicable";
  const comprovabetDocs = c.documents.filter((d) => d.category === "comprovabet");
  const primary = comprovabetDocs[comprovabetDocs.length - 1] ?? null;
  const primaryStatus = primary ? (primary.status as DocumentStatusValue) : null;
  const primaryCpf = primary?.cpfCheck ? (primary.cpfCheck as CpfCheckValue) : null;
  const primaryDetails = (primary?.checkDetails ?? null) as { yearsMentioned?: number[]; referenceYearMentioned?: boolean | null } | null;
  const othersAwaiting = (docId: string) =>
    comprovabetDocs
      .filter((d) => d.id !== docId && (DOCUMENT_AWAITING_REVIEW as readonly string[]).includes(d.status) && d.cpfCheck !== "mismatch")
      .map((d) => ({ name: d.originalName, cpfCheck: d.cpfCheck }));
  const cpfMasked = c.user.cpf ? maskCpf(c.user.cpf) : "—";
  const cpfLocked = CPF_LOCKED_STATUSES.includes(status) || comprovabetDocs.some((d) => d.status === "valid");
  const agreement = c.agreements[0] ?? null;
  const approvedPayment = c.payments.find((p) => p.status === "paid") ?? null;
  const preAnalysis = parsePreAnalysis(c.preAnalysis);
  const canStart =
    status === "payment_confirmed" ||
    ((legacy || (intake && payment === "confirmed")) && (status === "submitted" || status === "documents_received"));
  const latestNote = c.notes[0] ?? null;

  return (
    <div id="topo" className="space-y-5">
      <Link href="/admin/casos" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-navy-700 hover:bg-navy-50">
        <IconChevronLeft size={16} /> Casos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums text-ink sm:text-3xl">{c.protocol}</h1>
            <Badge tone={CASE_STATUS_TONE[status]}>{CASE_STATUS_LABEL[status]}</Badge>
            {lostControl(c.controlLoss) && <Badge tone="warn">{CONTROL_LOSS_SUMMARY[c.controlLoss!]}</Badge>}
            {c.isDemo && <Badge tone="warn">DEMO</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            Recebido em {formatDateTime(c.createdAt)} ·{" "}
            {legacy || payment === "confirmed" ? `prazo até ${formatDate(c.reviewDeadline)}` : "prazo conta a partir do pagamento"}
          </p>
        </div>
        <form action={bind(assignCase)} className="flex items-end gap-2">
          <label className="text-sm">
            <span className="text-xs text-muted">Responsável</span>
            <Select name="adminId" defaultValue={c.assignedAdminId ?? ""} className="mt-1 min-w-48 py-2">
              <option value="">Sem responsável</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <SubmitButton size="sm" variant="secondary" className="mb-0.5 min-h-10">
            Salvar
          </SubmitButton>
        </form>
      </div>

      {sp.ok && OK_MESSAGES[sp.ok] && <Notice tone="ok">{OK_MESSAGES[sp.ok]}</Notice>}
      {sp.erro && ERROR_MESSAGES[sp.erro] && <Notice tone="danger">{ERROR_MESSAGES[sp.erro]}</Notice>}

      {/* ── Primeiro contato (formulário sem documento) ─────────── */}
      {intake && c.contactDeadline && (
        <section
          id="contato"
          className={cx(
            "scroll-mt-24 rounded-2xl border p-5 shadow-soft",
            contact === "overdue" ? "border-danger-700/30 bg-danger-50" : contact === "pending" ? "border-warn-700/30 bg-warn-50" : "border-line bg-surface",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <IconClock size={18} className="shrink-0" /> Contato com o cliente
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                {contact === "done" ? (
                  <>
                    Contato feito em {formatDateTime(c.contactedAt)}
                    {c.contactedBy ? ` por ${c.contactedBy.name}` : ""}.
                  </>
                ) : (
                  <>
                    Prazo: <strong className="font-semibold text-ink">{formatDateTime(c.contactDeadline)}</strong> (1 dia útil depois do pagamento) ·{" "}
                    <span className={cx("font-semibold", contact === "overdue" ? "text-danger-700" : "text-warn-700")}>
                      {deadlineDistance(c.contactDeadline)}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Badge tone={contact === "done" ? "ok" : contact === "overdue" ? "danger" : "warn"}>
              {contact === "done" ? "Contato feito" : contact === "overdue" ? "Contato atrasado" : "Contato pendente"}
            </Badge>
          </div>
          <dl className="mt-3 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
            <Info label="Comprovação preferida">
              {c.evidencePreference ? labelFor(EVIDENCE_OPTIONS, c.evidencePreference) : <span className="text-muted">Não informada</span>}
            </Info>
            <Info label="Canal">
              {c.contactChannel ? (
                <>
                  {labelFor(CONTACT_CHANNELS, c.contactChannel)}
                  <span className="block text-xs">
                    {c.contactChannel === "email" ? (
                      <a href={`mailto:${c.user.email}`} className="break-all text-navy-700 hover:underline">
                        {c.user.email}
                      </a>
                    ) : c.contactChannel === "phone" ? (
                      <a href={`tel:+55${c.user.whatsapp}`} className="text-navy-700 hover:underline">
                        {formatPhoneBR(c.user.whatsapp)}
                      </a>
                    ) : (
                      <a href={`https://wa.me/55${c.user.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-navy-700 hover:underline">
                        {formatPhoneBR(c.user.whatsapp)}
                      </a>
                    )}
                  </span>
                </>
              ) : (
                <span className="text-muted">Não informado · use o WhatsApp</span>
              )}
            </Info>
            <Info label="Melhor horário">
              {c.contactPeriod ? labelFor(CONTACT_PERIODS, c.contactPeriod) : <span className="text-muted">Não informado</span>}
            </Info>
            <Info label="Preferências informadas em">
              {c.preferencesAt ? formatDateTime(c.preferencesAt) : <span className="text-muted">O cliente ainda não informou</span>}
            </Info>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line/70 pt-4">
            {contact === "done" ? (
              <form action={bind(undoContacted)}>
                <SubmitButton size="sm" variant="ghost" confirmMessage="Desfazer o registro do contato? O prazo volta a valer.">
                  Desfazer registro do contato
                </SubmitButton>
              </form>
            ) : (
              <ConfirmDialog
                label="Marcar contato como feito"
                variant="primary"
                title="Registrar o contato com o cliente?"
                confirmLabel="Registrar contato"
                action={markContacted.bind(null, c.id)}
                description={<p>O cliente verá “Contato realizado” no acompanhamento. Para pedir a comprovação, use depois “Solicitar documentos”.</p>}
              >
                <label className="block text-sm font-medium text-ink">
                  Resumo do contato (opcional, vira nota interna)
                  <Textarea name="note" maxLength={1000} placeholder="Ex.: combinado o envio do extrato bancário até sexta." className="mt-1.5 min-h-20 text-sm" />
                </label>
              </ConfirmDialog>
            )}
            <a href="#solicitar" className={buttonClasses("secondary", "sm")}>
              Solicitar documentos
            </a>
          </div>
        </section>
      )}

      {/* ── Resumo e ações rápidas ─────────────────────────────── */}
      <Section id="resumo" title="Resumo do caso">
        <dl className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          <Info label="Nome completo">{c.user.fullName}</Info>
          <Info label="CPF">
            {c.user.cpf ? (
              <RevealCpf masked={cpfMasked} reveal={revealCpf.bind(null, c.id)} />
            ) : (
              <span className="text-muted">Não informado (cadastro anterior ao CPF)</span>
            )}
          </Info>
          <Info label="Telefone (WhatsApp)">
            <a href={`https://wa.me/55${c.user.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-navy-700 hover:underline">
              {formatPhoneBR(c.user.whatsapp)}
            </a>
          </Info>
          <Info label="E-mail">
            <a href={`mailto:${c.user.email}`} className="break-all text-navy-700 hover:underline">
              {c.user.email}
            </a>
          </Info>
          <Info label="Data do cadastro">{formatDateTime(c.createdAt)}</Info>
          <Info label="Documento enviado">
            {primary ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-all">{primary.originalName}</span>
                <a href={`/api/admin/documents/${primary.id}/view`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-navy-700 hover:underline">
                  Visualizar
                </a>
                {comprovabetDocs.length > 1 && (
                  <a href="#documentos" className="text-xs text-muted hover:underline">
                    + {plural(comprovabetDocs.length - 1, "outro arquivo", "outros arquivos")}
                  </a>
                )}
              </span>
            ) : (
              <span className="text-muted">Nenhum ComprovaBet · {plural(c.documents.length, "documento", "documentos")} no caso</span>
            )}
          </Info>
          <Info label="Ano referente ao documento">
            {primary ? (
              <>
                {primary.referenceYear ?? config.comprovabetYear}
                {primaryDetails?.yearsMentioned && primaryDetails.yearsMentioned.length > 0 && (
                  <span className={cx("block text-xs", primaryDetails.referenceYearMentioned === false ? "font-medium text-warn-700" : "text-muted")}>
                    Anos citados no texto: {primaryDetails.yearsMentioned.join(", ")}
                  </span>
                )}
              </>
            ) : (
              "—"
            )}
          </Info>
          <Info label="Status da documentação">
            {primaryStatus ? (
              <span className="flex flex-wrap gap-1.5">
                <Badge tone={DOCUMENT_STATUS_TONE[primaryStatus]}>{DOCUMENT_STATUS_LABEL[primaryStatus]}</Badge>
                {primaryCpf && <Badge tone={CPF_CHECK_TONE[primaryCpf]}>{CPF_CHECK_LABEL[primaryCpf]}</Badge>}
              </span>
            ) : (
              "—"
            )}
          </Info>
          {preAnalysis && (
            <Info label="Pré-análise automática">
              <Badge tone={preAnalysis.status === "approved" ? "ok" : preAnalysis.status === "blocked" ? "warn" : "info"}>
                {PRE_ANALYSIS_STATUS_LABEL[preAnalysis.status]}
              </Badge>
              {preAnalysis.checks
                .filter((check) => check.state !== "ok")
                .map((check) => (
                  <span key={check.key} className="mt-1 block text-xs text-muted">
                    {PRE_CHECK_LABEL[check.key]}: {check.detail}
                  </span>
                ))}
            </Info>
          )}
          <Info label="Status da análise">
            <Badge tone={CASE_STATUS_TONE[status]}>{CASE_STATUS_LABEL[status]}</Badge>
          </Info>
          <Info label="Status do pagamento">
            <Badge tone={PAYMENT_STATUS_TONE[payment]}>{PAYMENT_STATUS_LABEL[payment]}</Badge>
            {payment === "confirmed" && approvedPayment && (
              <span className="mt-1 block text-xs text-muted">
                {providerLabel(approvedPayment.provider)} · {paymentMethodLabel(approvedPayment.paymentMethod)}
                {approvedPayment.paidAt && ` · ${formatDateTime(approvedPayment.paidAt)}`}
              </span>
            )}
            {!legacy && payment !== "confirmed" && (
              <span className="mt-1 block text-xs text-muted">
                {agreement ? `Condições aceitas em ${formatDateTime(agreement.acceptedAt)}` : "Condições do serviço ainda não aceitas"}
              </span>
            )}
          </Info>
          <Info label="Solicitação de documentos adicionais">
            {openRequest ? (
              <span className="text-warn-700">
                Em aberto desde {formatDate(openRequest.createdAt)}: {openRequest.reasons.map((r) => labelFor(REQUEST_REASONS, r)).join(", ")}
              </span>
            ) : (
              <span className="text-muted">Nenhuma em aberto</span>
            )}
          </Info>
          <Info label="Observações internas">
            {latestNote ? (
              <>
                <span className="line-clamp-2">{latestNote.content}</span>
                <a href="#notas" className="text-xs font-medium text-navy-700 hover:underline">
                  Ver notas ({c.notes.length})
                </a>
              </>
            ) : (
              <a href="#notas" className="text-navy-700 hover:underline">
                Adicionar nota
              </a>
            )}
          </Info>
        </dl>

        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Ações rápidas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {primary ? (
              <ComprovaBetActions doc={primary} caseId={c.id} cpfMasked={cpfMasked} others={othersAwaiting(primary.id)} payment={payment} />
            ) : (
              <ConfirmDialog
                label="Solicitar complemento"
                title="Solicitar complementação?"
                confirmLabel="Solicitar ao cliente"
                action={requestComplement.bind(null, c.id)}
                description={<p>O cliente verá “Precisamos complementar sua documentação”, os motivos e a sua observação.</p>}
              >
                <ReasonChoices />
                <ClientMessage />
              </ConfirmDialog>
            )}
            <ConfirmDialog
              label="Confirmar pagamento"
              variant="secondary"
              disabled={status !== "awaiting_payment"}
              disabledReason={
                payment === "confirmed"
                  ? approvedPayment
                    ? `Pagamento já confirmado automaticamente (${providerLabel(approvedPayment.provider)}).`
                    : "Pagamento já confirmado."
                  : "Disponível para casos na etapa Aguardando pagamento."
              }
              title="Confirmar o pagamento da análise?"
              confirmLabel="Confirmar pagamento"
              action={confirmPayment.bind(null, c.id)}
              description={
                <p>
                  Confirme só depois de verificar o recebimento. O prazo estimado da análise (até {config.reviewDays} dias úteis) passa a contar agora.
                </p>
              }
            >
              <label className="block text-sm font-medium text-ink">
                Referência do pagamento (opcional)
                <TextInput name="reference" maxLength={200} placeholder="Ex.: ID da transação ou forma de pagamento" className="mt-1.5 text-sm" />
              </label>
            </ConfirmDialog>
            <ConfirmDialog
              label="Iniciar análise"
              variant="primary"
              disabled={!canStart}
              disabledReason={
                intake
                  ? "Disponível com o pagamento confirmado, antes de a análise começar."
                  : "Disponível depois da validação documental e do pagamento confirmado."
              }
              title="Iniciar a análise do caso?"
              confirmLabel="Iniciar análise"
              action={startAnalysis.bind(null, c.id)}
              description={<p>O cliente verá “Análise em andamento” no acompanhamento.</p>}
            />
            <ConfirmDialog
              label="Concluir análise"
              variant="primary"
              disabled={status !== "under_review"}
              disabledReason="Disponível com a análise em andamento."
              title="Concluir a análise?"
              confirmLabel="Concluir análise"
              action={concludeAnalysis.bind(null, c.id)}
              description={
                <p>
                  O cliente verá “Análise concluída”. Para registrar “Caso com possibilidade de prosseguimento” ou “Elementos insuficientes”, use “Status
                  do caso”.
                </p>
              }
            >
              <label className="block text-sm font-medium text-ink">
                Mensagem para o cliente (opcional)
                <Textarea name="publicMessage" maxLength={1000} placeholder="Análise documental concluída." className="mt-1.5 min-h-20 text-sm" />
              </label>
            </ConfirmDialog>
          </div>
        </div>
      </Section>

      {/* ── Valores ─────────────────────────────────────────────── */}
      <Section id="valores" title="Valores">
        <div className="grid gap-3 md:grid-cols-3">
          {declared === null ? (
            <ValueCard
              label="Perdas informadas"
              value={c.lossRange ? labelFor(LOSS_RANGES, c.lossRange) : <span className="text-muted">—</span>}
              note="Faixa informada pelo cliente (sem valor exato)"
            />
          ) : (
            <ValueCard
              label="Valor declarado"
              value={formatBRL(declared)}
              note={c.declaredNeedsReview ? <span className="font-medium text-warn-700">Cálculo negativo, necessita revisão</span> : "Informado pelo cliente"}
            />
          )}
          <ValueCard
            label="Valor identificado"
            value={identified === null ? <span className="text-muted">—</span> : formatBRL(identified)}
            note={
              c.identifiedSource === "auto" ? (
                <span className="font-medium text-warn-700">Extraído automaticamente — necessita validação</span>
              ) : c.identifiedSource === "manual" ? (
                <span className="font-medium text-ok-700">Conferido pela equipe</span>
              ) : (
                "Aguardando leitura dos documentos"
              )
            }
          />
          <ValueCard
            label="Valor validado"
            highlight={validated !== null}
            value={validated === null ? <span className="text-muted">—</span> : formatBRL(validated)}
            note="Definido somente pela equipe. Não representa valor a ser recuperado."
          />
        </div>

        {divergence && declared !== null && (
          <div className="mt-4 rounded-xl border border-warn-700/25 bg-warn-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-warn-700">
              <IconAlert size={18} /> Divergência encontrada
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-warn-700/80">Declarado</dt>
                <dd className="font-medium tabular-nums text-ink">{formatBRL(declared)}</dd>
              </div>
              <div>
                <dt className="text-warn-700/80">Identificado</dt>
                <dd className="font-medium tabular-nums text-ink">{formatBRL(identified)}</dd>
              </div>
              <div>
                <dt className="text-warn-700/80">Diferença</dt>
                <dd className="font-medium tabular-nums text-ink">{formatBRL(Math.abs(divergence.diffCents))}</dd>
              </div>
              <div>
                <dt className="text-warn-700/80">Status</dt>
                <dd className="font-medium text-ink">Necessita conferência</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="rounded-xl border border-line p-4">
            <p className="text-sm font-semibold text-ink">Declarado pelo cliente</p>
            {declared === null ? (
              <dl className="mt-2 divide-y divide-dashed divide-line-strong text-sm">
                <div className="flex justify-between gap-3 py-1.5">
                  <dt className="text-muted">Faixa de perda</dt>
                  <dd className="text-right">{c.lossRange ? labelFor(LOSS_RANGES, c.lossRange) : "—"}</dd>
                </div>
                <div className="py-1.5 text-xs text-muted">O formulário sem documento pede só a faixa. Os valores exatos vêm da comprovação.</div>
              </dl>
            ) : (
            <dl className="mt-2 divide-y divide-dashed divide-line-strong text-sm">
              <div className="flex justify-between py-1.5">
                <dt className="text-muted">Depósitos</dt>
                <dd className="tabular-nums">{formatBRL(decimalToCents(c.declaredDeposits))}</dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-muted">Saques</dt>
                <dd className="tabular-nums">{formatBRL(decimalToCents(c.declaredWithdrawals))}</dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-muted">Saldo {declaration && !declaration.hasBalance && "(sem saldo)"}</dt>
                <dd className="tabular-nums">{formatBRL(decimalToCents(c.declaredBalance))}</dd>
              </div>
              {declaration && (
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted">Resultado bruto</dt>
                  <dd className="tabular-nums">{formatBRL(decimalToCents(declaration.rawResult))}</dd>
                </div>
              )}
            </dl>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <form action={bind(saveIdentified)} className="space-y-3">
            <p className="text-sm font-semibold text-ink">Conferência do valor identificado</p>
            <MoneyField name="deposits" id="identified-deposits" label="Depósitos identificados" defaultCents={decimalToCents(c.identifiedDeposits)} />
            <MoneyField
              name="withdrawals"
              id="identified-withdrawals"
              label="Saques identificados"
              defaultCents={decimalToCents(c.identifiedWithdrawals)}
            />
            <MoneyField name="balance" id="identified-balance" label="Saldo identificado" defaultCents={decimalToCents(c.identifiedBalance)} />
            <Textarea name="comment" placeholder="Comentário (opcional)" className="min-h-16 text-sm" maxLength={500} />
            <SubmitButton size="sm" className="w-full">
              Salvar valor conferido
            </SubmitButton>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {c.identifiedSource === "auto" && (
                <form action={bind(confirmIdentified)}>
                  <SubmitButton size="sm" variant="ok">
                    Confirmar automático
                  </SubmitButton>
                </form>
              )}
              <form action={bind(recalcIdentified)}>
                <SubmitButton
                  size="sm"
                  variant="ghost"
                  confirmMessage="Recalcular a partir dos documentos? O valor conferido manualmente será substituído pela leitura automática."
                >
                  <IconRefresh size={15} /> Recalcular pelos documentos
                </SubmitButton>
              </form>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <form action={bind(saveValidated)} className="space-y-3">
              <p className="text-sm font-semibold text-ink">Valor validado para análise</p>
              <MoneyField name="validated" id="validated" label="Valor validado" defaultCents={validated} />
              <Textarea name="comment" placeholder="Justificativa (opcional)" className="min-h-16 text-sm" maxLength={500} />
              <SubmitButton size="sm" className="w-full">
                Salvar valor validado
              </SubmitButton>
            </form>
            {validated !== null && (
              <form action={bind(clearValidated)} className="border-t border-line pt-3">
                <SubmitButton size="sm" variant="ghost" confirmMessage="Remover o valor validado?">
                  Remover valor validado
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="solicitante" title="Solicitante">
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <Info label="Nome">{c.user.fullName}</Info>
            <Info label="CPF">
              {c.user.cpf ? <RevealCpf masked={cpfMasked} reveal={revealCpf.bind(null, c.id)} /> : <span className="text-muted">Não informado</span>}
            </Info>
            <Info label="E-mail">
              <a href={`mailto:${c.user.email}`} className="text-navy-700 hover:underline">
                {c.user.email}
              </a>
            </Info>
            <Info label="WhatsApp">
              <a href={`https://wa.me/55${c.user.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-navy-700 hover:underline">
                {formatPhoneBR(c.user.whatsapp)}
              </a>
            </Info>
            <Info label="Maioridade">{c.user.isAdult ? "Confirmou ter 18 anos ou mais" : "Não confirmada"}</Info>
            <Info label="Consentimento LGPD">
              {formatDateTime(c.privacyConsentAt)}
              {c.privacyConsentIp && <span className="text-muted"> · IP {c.privacyConsentIp}</span>}
            </Info>
          </dl>
          <div className="mt-3 border-t border-line pt-3">
            {cpfLocked ? (
              <p className="text-xs text-muted">CPF travado: a análise documental já avançou e o CPF não pode mais ser alterado.</p>
            ) : admin.role === "admin" ? (
              <ConfirmDialog
                label="Corrigir CPF"
                variant="ghost"
                title="Corrigir o CPF do solicitante?"
                confirmLabel="Corrigir CPF"
                action={correctCpf.bind(null, c.id)}
                description={
                  <p>
                    Use apenas para erro de digitação, antes da aprovação do documento. O ComprovaBet é conferido de novo com o CPF corrigido. Depois
                    da validação documental, o CPF fica travado.
                  </p>
                }
              >
                <label className="block text-sm font-medium text-ink">
                  CPF correto
                  <TextInput name="cpf" required inputMode="numeric" autoComplete="off" maxLength={14} placeholder="000.000.000-00" className="mt-1.5" />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Motivo da correção
                  <Textarea name="reason" required maxLength={300} className="mt-1.5 min-h-16 text-sm" />
                </label>
              </ConfirmDialog>
            ) : (
              <p className="text-xs text-muted">A correção do CPF é restrita a administradores.</p>
            )}
          </div>
        </Section>

        <Section id="classificacao" title={intake ? "Respostas do formulário" : "Classificação"}>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            {c.firstRequestDeclared !== null && (
              <Info label="Primeira solicitação do CPF">
                {c.firstRequestDeclared ? "Declarou que nunca pediu o estorno" : "Não declarada"}
              </Info>
            )}
            {c.lossRange && <Info label="Faixa de perda informada">{labelFor(LOSS_RANGES, c.lossRange)}</Info>}
            <Info label="Tempo de uso">{labelFor(PERIODS, c.period)}</Info>
            <Info label="Plataformas">{c.platforms.map((p) => p.platform.name + (p.platform.isCustom ? " (informada)" : "")).join(", ")}</Info>
            {c.betType ? (
              <>
                <Info label="Tipo">{BET_TYPE_SUMMARY[c.betType]}</Info>
                <Info label="Detalhe">{detail || "—"}</Info>
              </>
            ) : null}
            {!intake && (
              <>
                <Info label="Controle das apostas">
                  {c.controlLoss ? CONTROL_LOSS_SUMMARY[c.controlLoss] : <span className="text-muted">Não perguntado (solicitação anterior)</span>}
                </Info>
                <Info label="O que aconteceu">
                  {c.situations.map((s) => labelFor(SITUATIONS, s)).join("; ") || "—"}
                  {c.situationOther && <span className="block text-ink-soft">“{c.situationOther}”</span>}
                </Info>
              </>
            )}
            {!intake && (
            <Info label="Compromisso voluntário">
              {c.commitment?.accepted ? (
                <>
                  Aceito em {formatDateTime(c.commitment.acceptedAt)}
                  <span className="block text-xs text-muted">
                    IP {c.commitment.ip ?? "—"} · versão {c.commitment.textVersion}
                  </span>
                  {c.commitment.userAgent && <span className="block truncate text-xs text-muted">{c.commitment.userAgent}</span>}
                </>
              ) : (
                "Não registrado"
              )}
            </Info>
            )}
          </dl>
        </Section>
      </div>

      {/* ── Documentos ─────────────────────────────────────────── */}
      <Section
        id="documentos"
        title={`Documentos (${c.documents.length})`}
        aside={<span className="text-xs text-muted">Links de visualização expiram em 5 minutos e ficam registrados.</span>}
      >
        {c.documents.length === 0 ? (
          <p className="text-sm text-muted">Nenhum documento.</p>
        ) : (
          <ul className="space-y-3">
            {c.documents.map((doc) => {
              const summary = doc.extractedSummary as unknown as ExtractionSummary | null;
              const docStatus = doc.status as DocumentStatusValue;
              const setStatus = bind(setDocumentStatus);
              const isComprovaBet = doc.category === "comprovabet";
              const cpfCheck = doc.cpfCheck ? (doc.cpfCheck as CpfCheckValue) : null;
              const details = (doc.checkDetails ?? null) as { yearsMentioned?: number[]; referenceYearMentioned?: boolean | null } | null;
              return (
                <li key={doc.id} id={`doc-${doc.id}`} className="scroll-mt-24 rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-medium text-ink">{doc.originalName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {isComprovaBet
                          ? `ComprovaBet ${doc.referenceYear ?? config.comprovabetYear}`
                          : `${doc.platformName ?? "Sem plataforma"} · ${categoryLabel(doc.category)}`}{" "}
                        · {formatBytes(doc.sizeBytes)} · {doc.uploadedVia === "additional" ? "Documentação adicional" : "Envio inicial"} ·{" "}
                        {formatDateTime(doc.createdAt)}
                      </p>
                    </div>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={DOCUMENT_STATUS_TONE[docStatus]}>{DOCUMENT_STATUS_LABEL[docStatus]}</Badge>
                      {cpfCheck && <Badge tone={CPF_CHECK_TONE[cpfCheck]}>{CPF_CHECK_LABEL[cpfCheck]}</Badge>}
                    </span>
                  </div>

                  {isComprovaBet && doc.cpfCheckNote && (
                    <p className={cx("mt-2 text-sm", cpfCheck === "mismatch" ? "text-danger-700" : "text-ink-soft")}>
                      <span className="font-medium text-ink">Conferência do CPF:</span> {doc.cpfCheckNote}
                    </p>
                  )}
                  {isComprovaBet && details?.yearsMentioned && details.yearsMentioned.length > 0 && (
                    <p className={cx("mt-1 text-xs", details.referenceYearMentioned === false ? "font-medium text-warn-700" : "text-muted")}>
                      Anos citados no texto: {details.yearsMentioned.join(", ")}
                      {details.referenceYearMentioned === false && ` · o ano de referência (${doc.referenceYear ?? config.comprovabetYear}) não aparece`}
                    </p>
                  )}
                  {doc.reviewNote && <p className="mt-2 text-sm text-ink-soft">Observação: {doc.reviewNote}</p>}
                  {doc.reviewedBy && doc.reviewedAt && (
                    <p className="mt-1 text-xs text-muted">
                      Conferido por {doc.reviewedBy.name} em {formatDateTime(doc.reviewedAt)}
                    </p>
                  )}
                  {!doc.reviewedBy && doc.reviewedAt && doc.status === "valid" && (
                    <p className="mt-1 text-xs text-muted">Aprovado automaticamente na pré-análise em {formatDateTime(doc.reviewedAt)}</p>
                  )}

                  <div className="mt-3 rounded-lg bg-paper px-3 py-2.5 text-sm">
                    {doc.extractionStatus === "done" && summary ? (
                      <>
                        <p className="text-xs font-semibold text-warn-700">Extraído automaticamente — necessita validação</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-ink">
                          <span>
                            Depósitos: <strong className="tabular-nums">{formatBRL(summary.deposits.totalCents)}</strong> ({summary.deposits.count})
                          </span>
                          <span>
                            Saques: <strong className="tabular-nums">{formatBRL(summary.withdrawals.totalCents)}</strong> ({summary.withdrawals.count})
                          </span>
                          {summary.balanceCents !== null && (
                            <span>
                              Saldo: <strong className="tabular-nums">{formatBRL(summary.balanceCents)}</strong>
                            </span>
                          )}
                          {summary.periodStart && summary.periodEnd && (
                            <span>
                              Período: {formatDate(summary.periodStart)} a {formatDate(summary.periodEnd)}
                            </span>
                          )}
                        </div>
                        {summary.statedTotals && (summary.statedTotals.depositsCents || summary.statedTotals.withdrawalsCents) ? (
                          <p className="mt-1 text-xs text-muted">
                            Totais declarados no próprio arquivo:{" "}
                            {summary.statedTotals.depositsCents ? `depósitos ${formatBRL(summary.statedTotals.depositsCents)}` : ""}
                            {summary.statedTotals.depositsCents && summary.statedTotals.withdrawalsCents ? " · " : ""}
                            {summary.statedTotals.withdrawalsCents ? `saques ${formatBRL(summary.statedTotals.withdrawalsCents)}` : ""}
                          </p>
                        ) : null}
                        {doc._count.transactions > 0 && (
                          <p className="mt-1 text-xs text-muted">
                            {doc._count.transactions} movimentação(ões) repetida(s) em outro arquivo — não somada(s) novamente.
                          </p>
                        )}
                        {summary.warnings.length > 0 && (
                          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-warn-700">
                            {summary.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : doc.extractionStatus === "unsupported" ? (
                      <p className="text-ink-soft">Imagem: leitura automática indisponível. Conferência manual necessária.</p>
                    ) : doc.extractionStatus === "failed" ? (
                      <p className="text-danger-700">Falha na leitura automática: {doc.extractionError ?? "erro desconhecido"}</p>
                    ) : (
                      <p className="text-ink-soft">Leitura automática em andamento…</p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a href={`/api/admin/documents/${doc.id}/view`} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
                      <IconEye size={15} /> Visualizar
                    </a>
                    {isComprovaBet ? (
                      <ComprovaBetActions doc={doc} caseId={c.id} cpfMasked={cpfMasked} others={othersAwaiting(doc.id)} payment={payment} />
                    ) : (
                      <>
                        <form action={setStatus}>
                          <input type="hidden" name="documentId" value={doc.id} />
                          <input type="hidden" name="status" value="valid" />
                          <SubmitButton size="sm" variant="ok" confirmMessage="Aprovar este documento?">
                            Aprovar
                          </SubmitButton>
                        </form>
                        <form action={setStatus}>
                          <input type="hidden" name="documentId" value={doc.id} />
                          <input type="hidden" name="status" value="divergent" />
                          <SubmitButton size="sm" variant="danger" confirmMessage="Marcar este documento como inconsistente?">
                            Marcar como inconsistente
                          </SubmitButton>
                        </form>
                        <Link href={`/admin/casos/${c.id}?solicitar=${doc.id}#solicitar`} className={buttonClasses("secondary", "sm")}>
                          Solicitar novo documento
                        </Link>
                      </>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">Outras ações</summary>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <form action={setStatus} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="documentId" value={doc.id} />
                        <Select name="status" defaultValue={docStatus} className="w-auto py-2 text-sm" aria-label="Status do documento">
                          {DOCUMENT_STATUS_VALUES.map((s) => (
                            <option key={s} value={s}>
                              {DOCUMENT_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                        <input
                          name="reviewNote"
                          placeholder="Observação (opcional)"
                          maxLength={500}
                          className="min-h-10 rounded-xl border border-line-strong px-3 text-sm"
                        />
                        <SubmitButton size="sm" variant="secondary">
                          Aplicar
                        </SubmitButton>
                      </form>
                      <form action={bind(reprocessDocument)}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <SubmitButton size="sm" variant="ghost">
                          <IconRefresh size={15} /> Refazer leitura
                        </SubmitButton>
                      </form>
                      {isComprovaBet && (cpfCheck === "pending" || cpfCheck === "mismatch" || cpfCheck === null) && (
                        <ConfirmDialog
                          label="Conferir CPF manualmente"
                          variant="ghost"
                          title="Registrar a conferência manual do CPF?"
                          confirmLabel="CPF confere"
                          confirmVariant="ok"
                          action={confirmCpfManually.bind(null, c.id)}
                          hidden={{ documentId: doc.id }}
                          description={
                            <p>
                              Confirme apenas depois de abrir o documento e verificar que o CPF é o mesmo do cadastro ({cpfMasked}).
                              {cpfCheck === "mismatch" && " A leitura automática encontrou outro CPF: explique a conferência."}
                            </p>
                          }
                        >
                          <label className="block text-sm font-medium text-ink">
                            Observação {cpfCheck === "mismatch" ? "(obrigatória)" : "(opcional)"}
                            <Textarea name="note" required={cpfCheck === "mismatch"} maxLength={300} className="mt-1.5 min-h-16 text-sm" />
                          </label>
                        </ConfirmDialog>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ── Pagamento ─────────────────────────────────────────── */}
      <Section id="pagamento" title="Pagamento da análise">
        {legacy ? (
          <p className="text-sm text-muted">Caso registrado antes da etapa de pagamento: não se aplica.</p>
        ) : (
          <>
            <dl className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
              <Info label="Status">
                <Badge tone={PAYMENT_STATUS_TONE[payment]}>{PAYMENT_STATUS_LABEL[payment]}</Badge>
              </Info>
              <Info label="Aceite das condições">
                {agreement ? (
                  <>
                    {formatDateTime(agreement.acceptedAt)}
                    <span className="block text-xs text-muted">
                      versão {agreement.termsVersion}
                      {agreement.termsVersion !== SERVICE_TERMS_VERSION && " (anterior à atual)"} · IP {agreement.ip ?? "—"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">Ainda não aceitas</span>
                )}
              </Info>
              <Info label="Confirmado em">
                {c.paymentConfirmedAt ? (
                  <>
                    {formatDateTime(c.paymentConfirmedAt)}
                    <span className="block text-xs text-muted">
                      {c.paymentConfirmedBy
                        ? `por ${c.paymentConfirmedBy.name}`
                        : approvedPayment
                          ? `automaticamente (${providerLabel(approvedPayment.provider)})`
                          : ""}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </Info>
              <Info label="Referência">{c.paymentReference ?? "—"}</Info>
            </dl>
            {c.payments.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {c.payments.length === 1 ? "Transação" : `Tentativas de pagamento (${c.payments.length})`}
                </p>
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {c.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-ink">
                          {providerLabel(p.provider)} · {paymentMethodLabel(p.paymentMethod)}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDateTime(p.paidAt ?? p.createdAt)}
                          {p.providerTransactionId ? ` · transação ${p.providerTransactionId}` : ""}
                          {p.externalReference ? ` · ref. ${p.externalReference}` : ""}
                        </span>
                        {p.statusDetail && <span className="block text-xs text-muted">{p.statusDetail}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-ink">{formatBRL(decimalToCents(p.amount) ?? 0)}</span>
                        <Badge tone={PAYMENT_ATTEMPT_TONE[p.status]}>{PAYMENT_ATTEMPT_LABEL[p.status]}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {status === "awaiting_payment" && (
              <p className="mt-3 text-xs text-muted">
                {payment === "awaiting_confirmation"
                  ? "O cliente informou que pagou. Confira o recebimento e use “Confirmar pagamento” no resumo do caso."
                  : "Aguardando o cliente aceitar as condições e realizar o pagamento."}
              </p>
            )}
          </>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="status" title="Status do caso">
          <form action={bind(updateStatus)} className="space-y-3">
            <Select name="status" defaultValue={ADMIN_SETTABLE_STATUSES.includes(status) ? status : "under_review"} aria-label="Novo status">
              {ADMIN_SETTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CASE_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Textarea name="publicMessage" placeholder="Mensagem para o cliente (opcional, aparece no acompanhamento)" maxLength={1000} className="text-sm" />
            <SubmitButton size="sm" className="w-full sm:w-auto" confirmMessage="Atualizar o status do caso? O cliente verá a nova etapa no acompanhamento.">
              Atualizar status
            </SubmitButton>
            <p className="text-xs text-muted">
              Para seguir o fluxo (aprovação do documento, pagamento, início e conclusão da análise), prefira as ações rápidas do resumo. Para pedir
              documentos, use “Solicitar documentos”: o status muda automaticamente.
            </p>
          </form>
        </Section>

        <Section id="solicitar" title="Solicitar documentos">
          {openRequest && (
            <Notice tone="warn" className="mb-4">
              Pedido em aberto desde {formatDateTime(openRequest.createdAt)}: {openRequest.reasons.map((r) => labelFor(REQUEST_REASONS, r)).join(", ")}.{" "}
              {openRequest._count.documents} arquivo(s) recebido(s). Um novo pedido substitui o atual.
            </Notice>
          )}
          <form action={bind(requestDocuments)} className="space-y-3">
            <fieldset>
              <legend className="text-sm font-medium text-ink">Motivo</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {REQUEST_REASONS.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="reasons" value={r.value} className="size-4 accent-navy-900" />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Textarea
              name="message"
              maxLength={1000}
              className="text-sm"
              placeholder="Mensagem ao cliente (opcional)"
              defaultValue={requestDoc ? `Sobre o arquivo “${requestDoc.originalName}”: ` : ""}
            />
            <SubmitButton size="sm" className="w-full sm:w-auto" confirmMessage="Solicitar documentos ao cliente? O caso passa para “Documentação complementar necessária”.">
              Solicitar documentos
            </SubmitButton>
          </form>
        </Section>
      </div>

      <Section id="proximos" title="Próximos passos (visíveis ao cliente)">
        <form action={bind(saveNextSteps)} className="space-y-3">
          <Textarea
            name="nextSteps"
            defaultValue={c.nextSteps ?? ""}
            maxLength={2000}
            className="text-sm"
            placeholder="Exibido quando o caso tiver possibilidade de prosseguimento ou for concluído. Se vazio, usamos um texto padrão."
          />
          <SubmitButton size="sm" variant="secondary">
            Salvar próximos passos
          </SubmitButton>
        </form>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="notas" title="Notas internas">
          <form action={bind(addNote)} className="space-y-3">
            <Textarea name="content" required maxLength={4000} className="text-sm" placeholder="Nota visível apenas para a equipe" />
            <SubmitButton size="sm" variant="secondary">
              Adicionar nota
            </SubmitButton>
          </form>
          {c.notes.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {c.notes.map((n) => (
                <li key={n.id} className="py-3">
                  <p className="whitespace-pre-line text-sm text-ink">{n.content}</p>
                  <p className="mt-1 text-xs text-muted">
                    {n.admin.name} · {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="historico" title="Histórico">
          <ul className="space-y-2.5 text-sm">
            {c.statusHistory.map((hItem) => (
              <li key={hItem.id} className="flex gap-3">
                <span className="w-32 shrink-0 text-xs text-muted">{formatDateTime(hItem.createdAt)}</span>
                <span>
                  {CASE_STATUS_LABEL[hItem.toStatus as CaseStatusValue]}
                  <span className="text-muted"> · {hItem.changedBy?.name ?? "sistema"}</span>
                  {hItem.publicMessage && <span className="block text-xs text-ink-soft">“{hItem.publicMessage}”</span>}
                </span>
              </li>
            ))}
          </ul>
          {c.reviews.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">Registro de conferências</summary>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-soft">
                {c.reviews.map((r) => (
                  <li key={r.id}>
                    {formatDateTime(r.createdAt)} · {r.admin.name} · {r.action}
                    {r.identifiedLoss !== null && ` · identificado ${formatBRL(decimalToCents(r.identifiedLoss))}`}
                    {r.validatedLoss !== null && ` · validado ${formatBRL(decimalToCents(r.validatedLoss))}`}
                    {r.comment && ` · ${r.comment}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      </div>

      <Section id="lgpd" title="Dados pessoais (LGPD)">
        <p className="text-sm leading-relaxed text-ink-soft">
          Para atender pedidos do titular (acesso, portabilidade e eliminação, art. 18 da LGPD). Cada uso fica registrado.
        </p>
        <a href={`/api/admin/cases/${c.id}/export`} className={cx(buttonClasses("secondary", "sm"), "mt-4")}>
          Exportar dados (JSON)
        </a>
        {admin.role === "admin" ? (
          <form action={bind(deleteCase)} className="mt-5 space-y-3 rounded-xl border border-danger-700/20 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700">Excluir caso definitivamente</p>
            <p className="text-sm leading-relaxed text-danger-700">
              Apaga o caso, as respostas, os valores, as notas e todos os documentos do armazenamento. Não pode ser desfeito. Os registros de
              acesso são mantidos pelo prazo legal.
            </p>
            <label className="block text-sm text-danger-700">
              Digite <strong className="tabular-nums">{c.protocol}</strong> para confirmar
              <input
                name="confirmProtocol"
                required
                autoComplete="off"
                className="mt-1.5 block w-full max-w-xs rounded-xl border border-danger-700/30 bg-surface px-3.5 py-2.5 text-base text-ink uppercase tracking-wide focus:border-danger-700 focus:outline-none"
              />
            </label>
            <SubmitButton size="sm" variant="danger" confirmMessage={`Excluir definitivamente o caso ${c.protocol} e todos os documentos?`}>
              Excluir definitivamente
            </SubmitButton>
          </form>
        ) : (
          <p className="mt-4 text-xs text-muted">A exclusão definitiva é restrita a administradores.</p>
        )}
      </Section>
    </div>
  );
}
