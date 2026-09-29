import type { ReactNode } from "react";
import { trackingLogout } from "@/app/acompanhar/actions";
import type { ClientCase } from "@/lib/cases/client-view";
import {
  ANALYSIS_IN_PROGRESS_TEXT,
  contactWithinText,
  COMPLEMENT_TEXT,
  COMPLEMENT_TITLE,
  CPF_MISMATCH_MESSAGE,
  DOCUMENT_APPROVED_TEXT,
  DOCUMENT_APPROVED_TITLE,
  VALIDATION_PENDING_TEXT,
} from "@/lib/comprovabet";
import { formatDeadline } from "@/lib/contact";
import { cx } from "@/lib/cx";
import { config } from "@/lib/env";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { CONTACT_PROMISE } from "@/lib/intake";
import { CONTACT_CHANNELS, CONTACT_PERIODS, DEFAULT_NEXT_STEPS, EVIDENCE_OPTIONS, LOSS_RANGES, REQUEST_REASONS, labelFor } from "@/lib/options";
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, clientTimeline, type TimelineState } from "@/lib/status";
import { IconAlert, IconCheck, IconChevronRight, IconClock, IconFile, IconLogout } from "../icons";
import { Badge, LedgerRow, LinkButton, Notice } from "../ui";
import { PreferencesForm } from "./PreferencesForm";

const DOT: Record<TimelineState, string> = {
  done: "bg-navy-900 text-white border-navy-900",
  current: "bg-surface text-navy-900 border-navy-900",
  attention: "bg-warn-50 text-warn-700 border-warn-700",
  pending: "bg-surface text-line-strong border-line-strong",
};

function Card({ tone = "neutral", title, children }: { tone?: "neutral" | "ok" | "warn" | "info"; title?: string; children: ReactNode }) {
  const styles = {
    neutral: "border-line bg-surface",
    info: "border-navy-100 bg-navy-50",
    ok: "border-ok-600/25 bg-ok-50",
    warn: "border-warn-700/25 bg-warn-50",
  }[tone];
  const titleColor = { neutral: "text-ink", info: "text-navy-900", ok: "text-ok-700", warn: "text-warn-700" }[tone];
  return (
    <section className={cx("rounded-2xl border p-5", styles)}>
      {title && <p className={cx("text-lg font-semibold leading-snug", titleColor)}>{title}</p>}
      <div className={cx(title && "mt-2", "space-y-3 text-[0.95rem] leading-relaxed text-ink")}>{children}</div>
    </section>
  );
}

/**
 * Formulário sem documento, antes do primeiro contato: prazo do contato e as preferências (como comprovar, canal
 * e horário). Quem fechou a página depois de pagar informa as preferências aqui.
 */
function ContactBlock({ data }: { data: ClientCase }) {
  const deadline = data.contactDeadline ? formatDeadline(data.contactDeadline) : null;
  const prefs = data.preferences;
  if (!prefs) {
    return (
      <section id="contato" className="scroll-mt-24 rounded-2xl border border-navy-100 bg-navy-50 p-5">
        <p className="text-lg font-semibold leading-snug text-navy-900">Como você prefere seguir?</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
          {CONTACT_PROMISE} Conte como prefere ser contatado{deadline ? ` (prazo: ${deadline})` : ""}.
        </p>
        <div className="mt-5 rounded-2xl bg-surface p-4 sm:p-5">
          <PreferencesForm initial={{ evidence: null, contactChannel: null, contactPeriod: null }} submitLabel="Salvar preferências" />
        </div>
      </section>
    );
  }
  return (
    <section id="contato" className="scroll-mt-24 rounded-2xl border border-navy-100 bg-navy-50 p-5">
      <p className="flex items-center gap-2 text-lg font-semibold leading-snug text-navy-900">
        <IconClock size={20} className="shrink-0" /> Nossa equipe vai entrar em contato
      </p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
        {deadline ? (
          <>
            Prazo: <strong className="font-semibold">{deadline}</strong>. A equipe verifica com você quais documentos são necessários para
            prosseguir.
          </>
        ) : (
          CONTACT_PROMISE
        )}
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-xl bg-surface px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Comprovação</dt>
          <dd className="font-medium text-ink">{labelFor(EVIDENCE_OPTIONS, prefs.evidence)}</dd>
        </div>
        <div>
          <dt className="text-muted">Contato por</dt>
          <dd className="font-medium text-ink">{labelFor(CONTACT_CHANNELS, prefs.channel)}</dd>
        </div>
        <div>
          <dt className="text-muted">Horário</dt>
          <dd className="font-medium text-ink">{labelFor(CONTACT_PERIODS, prefs.contactPeriod)}</dd>
        </div>
      </dl>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-navy-700 [&::-webkit-details-marker]:hidden">
          Alterar preferências
          <IconChevronRight size={15} className="transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 rounded-2xl bg-surface p-4 sm:p-5">
          <PreferencesForm
            initial={{ evidence: prefs.evidence, contactChannel: prefs.channel, contactPeriod: prefs.contactPeriod }}
            submitLabel="Salvar alterações"
          />
        </div>
      </details>
    </section>
  );
}

/** O que o solicitante precisa saber (e fazer) agora, conforme a etapa do caso. */
function StageBlock({ data }: { data: ClientCase }) {
  // Formulário sem documento: até o primeiro contato, o que importa é o contato da equipe.
  if (data.contactDeadline && data.status === "submitted") {
    if (!data.contactedAt) return <ContactBlock data={data} />;
    return (
      <Card tone="info" title="Contato realizado">
        <p>
          Nossa equipe entrou em contato em {formatDateTime(data.contactedAt)}. Siga as orientações combinadas: quando for preciso enviar
          documentos, o pedido aparece aqui no acompanhamento.
        </p>
      </Card>
    );
  }
  switch (data.status) {
    case "submitted":
    case "documents_received":
      return (
        <Card tone="info" title="Validação documental">
          <p>{data.hasComprovaBet ? VALIDATION_PENDING_TEXT : "Seus documentos foram recebidos e estão aguardando a conferência da nossa equipe."}</p>
          {data.paymentStatus === "confirmed" && data.paymentConfirmedAt && (
            <p className="flex items-center gap-1.5 text-sm text-ok-700">
              <IconCheck size={16} strokeWidth={2.5} className="shrink-0" />
              Pagamento da análise confirmado em {formatDate(data.paymentConfirmedAt)}.
            </p>
          )}
        </Card>
      );
    case "additional_documents": {
      const cpfProblem =
        (data.document?.status === "cpf_mismatch" || data.openRequest?.reasons.includes("cpf_mismatch")) &&
        !data.openRequest?.message?.includes(CPF_MISMATCH_MESSAGE);
      return (
        <section className="rounded-2xl border border-warn-700/25 bg-warn-50 p-5">
          <div className="flex items-start gap-3">
            <IconAlert size={22} className="mt-0.5 shrink-0 text-warn-700" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-snug text-warn-700">{COMPLEMENT_TITLE}</p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{COMPLEMENT_TEXT}</p>
              {cpfProblem && <p className="mt-3 text-[0.95rem] font-medium leading-relaxed text-danger-700">{CPF_MISMATCH_MESSAGE}</p>}
              {data.openRequest && data.openRequest.reasons.length > 0 && (
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-warn-700">
                  {data.openRequest.reasons.map((r) => (
                    <li key={r}>{labelFor(REQUEST_REASONS, r)}</li>
                  ))}
                </ul>
              )}
              {data.openRequest?.message && (
                <div className="mt-3 rounded-xl bg-surface/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-warn-700">Orientações da equipe</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{data.openRequest.message}</p>
                </div>
              )}
            </div>
          </div>
          {data.openRequest && (
            <LinkButton href="/acompanhar/documentos" size="lg" className="mt-5 w-full">
              Enviar documentos
            </LinkButton>
          )}
        </section>
      );
    }
    case "awaiting_payment":
      return (
        <>
          {data.hasComprovaBet && (
            <Card tone="ok" title={DOCUMENT_APPROVED_TITLE}>
              <p>{DOCUMENT_APPROVED_TEXT}</p>
            </Card>
          )}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <p className="text-lg font-semibold leading-snug text-ink">
              {data.paymentStatus === "awaiting_confirmation" ? "Pagamento em confirmação" : "Próximo passo: pagamento da análise"}
            </p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
              {data.paymentStatus === "awaiting_confirmation"
                ? "Assim que a equipe confirmar o pagamento, a análise começa. Você acompanha por este painel."
                : "Confira as condições do serviço e siga para o pagamento."}
            </p>
            <LinkButton href="/acompanhar/pagamento" size="lg" className="mt-5 w-full" variant={data.paymentStatus === "awaiting_confirmation" ? "secondary" : "primary"}>
              {data.paymentStatus === "awaiting_confirmation" ? "Ver pagamento" : "Ir para o pagamento"}
            </LinkButton>
          </section>
        </>
      );
    case "payment_confirmed":
      return (
        <Card tone="ok" title={data.hasComprovaBet ? DOCUMENT_APPROVED_TITLE : "Documentação validada"}>
          {data.hasComprovaBet && <p>{DOCUMENT_APPROVED_TEXT}</p>}
          <p>A análise será iniciada pela nossa equipe. Você acompanha todas as etapas por este painel.</p>
          {data.paymentStatus === "confirmed" && <p className="text-sm text-ink-soft">{contactWithinText(config.reviewDays)}</p>}
        </Card>
      );
    case "under_review":
      return (
        <Card tone="info" title="Análise em andamento">
          <p>{ANALYSIS_IN_PROGRESS_TEXT}</p>
          {data.paymentStatus === "confirmed" && <p className="text-sm text-ink-soft">{contactWithinText(config.reviewDays)}</p>}
        </Card>
      );
    case "eligible":
      return (
        <section className="rounded-2xl border border-ok-600/25 bg-ok-50 p-5">
          <p className="text-lg font-semibold leading-snug text-ok-700">Identificamos elementos que permitem prosseguir com seu caso.</p>
          <details className="group mt-4">
            <summary className="inline-flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-ok-600 px-5 text-[0.84rem] font-semibold uppercase tracking-[0.06em] text-white hover:bg-ok-700 [&::-webkit-details-marker]:hidden">
              Ver próximos passos
              <IconChevronRight size={16} className="transition-transform group-open:rotate-90" />
            </summary>
            <p className="mt-4 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink">{data.nextSteps || DEFAULT_NEXT_STEPS}</p>
          </details>
        </section>
      );
    case "not_eligible":
      return (
        <Card>
          <p>Neste momento, não identificamos elementos suficientes para prosseguir com o caso.</p>
        </Card>
      );
    case "completed":
      return (
        <Card title="Análise concluída">
          <p>A análise documental do seu caso foi concluída.</p>
          {data.nextSteps && <p className="whitespace-pre-line text-sm text-ink-soft">{data.nextSteps}</p>}
        </Card>
      );
  }
}

const PREFERENCE_NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Preferências salvas. A equipe vai usar essas informações no contato." },
  incompleto: { tone: "warn", text: "Escolha uma opção em cada pergunta para salvar as preferências." },
  fechado: { tone: "warn", text: "A equipe já fez o primeiro contato: as preferências não podem mais ser alteradas por aqui." },
};

export function CaseTracking({ data, preferencesNotice }: { data: ClientCase; preferencesNotice?: string }) {
  const notice = preferencesNotice ? PREFERENCE_NOTICES[preferencesNotice] : undefined;
  const timeline = clientTimeline({
    status: data.status,
    paymentStatus: data.paymentStatus,
    history: data.history,
    createdAt: data.createdAt,
    documentSentAt: data.documentSentAt,
    hasComprovaBet: data.hasComprovaBet,
    documentApprovedAt: data.documentApprovedAt,
    paymentConfirmedAt: data.paymentConfirmedAt,
    contactDeadline: data.contactDeadline,
    contactedAt: data.contactedAt,
  });
  // O prazo da análise conta a partir do pagamento (casos antigos mantêm o prazo original).
  const showDeadline =
    data.paymentStatus === "not_applicable" || data.paymentStatus === "confirmed" || ["under_review", "payment_confirmed"].includes(data.status);
  return (
    <div className="step-in space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Caso</p>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-wide text-ink tabular-nums">{data.protocol}</h1>
        </div>
        <form action={trackingLogout}>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-ink">
            <IconLogout size={16} /> Sair
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">Etapa atual:</span>
        <Badge tone={CASE_STATUS_TONE[data.status]}>{CASE_STATUS_LABEL[data.status]}</Badge>
      </div>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <StageBlock data={data} />

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Andamento</h2>
        <ol className="mt-4">
          {timeline.map((step, i) => (
            <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
              {i < timeline.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx("absolute left-[0.8rem] top-7 h-[calc(100%-1.5rem)] w-px", step.state === "done" ? "bg-navy-900" : "bg-line-strong")}
                />
              )}
              <span className={cx("relative z-10 grid size-[1.65rem] shrink-0 place-items-center rounded-full border-2", DOT[step.state])}>
                {step.state === "done" && <IconCheck size={14} strokeWidth={3} />}
                {step.state === "current" && <span className="size-2 rounded-full bg-navy-900" />}
                {step.state === "attention" && <span className="size-2 rounded-full bg-warn-700" />}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cx("font-medium", step.state === "pending" ? "text-muted" : "text-ink")}>
                  <span className="mr-1.5 text-sm tabular-nums text-muted">{i + 1}.</span>
                  {step.label}
                </p>
                {step.note && <p className={cx("text-sm", step.state === "attention" ? "text-warn-700" : "text-ink-soft")}>{step.note}</p>}
                {step.state === "current" && !step.note && <p className="text-sm text-ink-soft">Etapa atual</p>}
                {step.date && step.state !== "pending" && <p className="text-sm text-muted">{formatDate(step.date)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {data.documents.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">{data.documents.length === 1 ? "Seu documento" : "Seus documentos"}</h2>
          {data.cpfMasked && (
            <p className="mt-1 text-sm text-muted">
              CPF cadastrado: <span className="font-medium tabular-nums tracking-wide text-ink-soft">{data.cpfMasked}</span>
            </p>
          )}
          <ul className="mt-2 divide-y divide-dashed divide-line-strong">
            {data.documents.map((doc) => (
              <li key={doc.id} className="py-3 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-paper text-navy-700">
                    <IconFile size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{doc.name}</p>
                    <p className="text-xs text-muted">ComprovaBet · enviado em {formatDate(doc.sentAt)}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Badge tone={doc.tone}>{doc.label}</Badge>
                  {doc.cpf && <Badge tone={doc.cpf.tone}>{doc.cpf.label}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface px-5 pb-2 pt-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Valores</h2>
        <dl className="mt-1 divide-y divide-dashed divide-line-strong">
          {data.lossRange ? (
            <LedgerRow label="Perdas informadas" hint="Faixa informada por você" value={labelFor(LOSS_RANGES, data.lossRange)} />
          ) : (
            <LedgerRow label="Perda declarada" hint="Informada por você" value={formatBRL(data.declaredLossCents ?? 0)} />
          )}
          <LedgerRow
            label="Valor documentalmente identificado"
            hint="Conferido a partir dos documentos"
            value={data.identifiedLossCents === null ? <span className="text-muted">Em análise</span> : formatBRL(data.identifiedLossCents)}
          />
          <LedgerRow
            label="Valor validado para análise"
            hint="Definido pela nossa equipe"
            value={data.validatedLossCents === null ? <span className="text-muted">—</span> : formatBRL(data.validatedLossCents)}
          />
          {showDeadline && (
            <LedgerRow
              label="Prazo para retorno"
              hint={data.paymentStatus === "confirmed" ? `${config.reviewDays} dias úteis` : undefined}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <IconClock size={16} className="text-muted" />
                  Até {formatDate(data.reviewDeadline)}
                </span>
              }
            />
          )}
        </dl>
      </section>

      {data.latestMessage && data.status !== "additional_documents" && (
        <section className="rounded-2xl border border-navy-100 bg-navy-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-700">Mensagem da equipe</p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">{data.latestMessage}</p>
        </section>
      )}

      <p className="text-sm leading-relaxed text-muted">
        Plataformas: {data.platforms.join(", ")} · {data.documentsCount} {data.documentsCount === 1 ? "documento recebido" : "documentos recebidos"}.
        Cada caso é analisado individualmente pela nossa equipe.
      </p>
    </div>
  );
}
