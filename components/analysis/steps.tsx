"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PAYMENT_NOTICE, SERVICE_TERMS_CHECKBOX } from "@/lib/comprovabet";
import { cpfDigits, maskCpfInput } from "@/lib/cpf";
import { cx } from "@/lib/cx";
import { formatBRL, formatDateTime, maskPhoneInput } from "@/lib/format";
import { ALREADY_REQUESTED_MESSAGE, CONTACT_PROMISE, MANUAL_SUPPORT_TEXT, RESULT_TITLE, RESULT_VALUE_NOTE } from "@/lib/intake";
import { paymentMethodLabel } from "@/lib/payments/types";
import { LOSS_RANGES, PERIODS, PLATFORMS, PREVIOUS_REQUESTS, PRIVACY_CONSENT_TEXT, labelFor } from "@/lib/options";
import { PreferenceFields } from "../PreferenceFields";
import { IconAlert, IconCheck, IconCopy, IconInfo, IconLock, IconPlus, IconSpinner, IconX } from "../icons";
import { Button, Field, Notice, TextInput } from "../ui";
import { ChoiceCard } from "./ChoiceCard";
import { contactErrors, preferenceErrors, type PaymentState, type PixState, type Screen, type WizardData } from "./state";

type HeadingRef = RefObject<HTMLHeadingElement | null>;
type Update = (patch: Partial<WizardData>) => void;

export function StepHeading({ headingRef, id, title, subtitle }: { headingRef: HeadingRef; id: string; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1
        ref={headingRef}
        id={id}
        tabIndex={-1}
        className="text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.015em] text-ink outline-none sm:text-[2rem]"
      >
        {title}
      </h1>
      {subtitle && <p className="mt-2.5 text-[0.98rem] leading-relaxed text-ink-soft">{subtitle}</p>}
    </div>
  );
}

// ─── Etapa 1: primeira solicitação do CPF ─────────────────────────────────
export function PreviousStep({ data, headingRef, onChoose }: { data: WizardData; headingRef: HeadingRef; onChoose: (value: "yes" | "no") => void }) {
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-previous"
        title="Você já pediu o estorno dessas perdas alguma vez?"
        subtitle="A solicitação é feita uma única vez por CPF."
      />
      <div role="radiogroup" aria-labelledby="q-previous" className="space-y-3">
        {PREVIOUS_REQUESTS.map((o) => (
          <ChoiceCard key={o.value} selected={data.previousRequest === o.value} onSelect={() => onChoose(o.value)} title={o.label} description={o.description} />
        ))}
      </div>
      {data.previousRequest === "yes" && (
        <section className="step-in mt-6 rounded-2xl border border-warn-700/25 bg-warn-50 p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-lg font-semibold text-warn-700">
            <IconAlert size={20} className="shrink-0" /> Não é possível seguir por aqui
          </p>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{ALREADY_REQUESTED_MESSAGE}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Se marcou esta opção por engano, escolha “Não, nunca pedi” para continuar.</p>
        </section>
      )}
    </>
  );
}

// ─── Etapa 2: casas de apostas ────────────────────────────────────────────
export function PlatformsStep({ data, update, headingRef }: { data: WizardData; update: Update; headingRef: HeadingRef }) {
  const toggle = (slug: string) =>
    update({ platforms: data.platforms.includes(slug) ? data.platforms.filter((s) => s !== slug) : [...data.platforms, slug] });
  const setCustom = (index: number, value: string) =>
    update({ customPlatforms: data.customPlatforms.map((c, i) => (i === index ? value.slice(0, 60) : c)) });
  const removeCustom = (index: number) => {
    const rest = data.customPlatforms.filter((_, i) => i !== index);
    update(rest.length ? { customPlatforms: rest } : { customPlatforms: [""], otherPlatformEnabled: false });
  };
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-platforms" title="Em quais casas de apostas você já apostou?" subtitle="Marque todas que você usou." />
      <div role="group" aria-labelledby="q-platforms" className="grid grid-cols-2 gap-3">
        {PLATFORMS.map((p) => (
          <ChoiceCard key={p.slug} compact multiple selected={data.platforms.includes(p.slug)} onSelect={() => toggle(p.slug)} title={p.name} />
        ))}
        <ChoiceCard
          compact
          multiple
          selected={data.otherPlatformEnabled}
          onSelect={() =>
            update({ otherPlatformEnabled: !data.otherPlatformEnabled, customPlatforms: data.customPlatforms.length ? data.customPlatforms : [""] })
          }
          title="Outra"
        />
      </div>
      {data.otherPlatformEnabled && (
        <div className="step-in mt-5 space-y-3 rounded-2xl border border-line bg-surface p-4">
          {data.customPlatforms.map((name, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i === 0 ? "Nome da casa de apostas" : `Nome da casa de apostas ${i + 1}`} htmlFor={`custom-${i}`} className="flex-1">
                <TextInput
                  id={`custom-${i}`}
                  value={name}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="Ex.: nome do site ou aplicativo"
                  onChange={(e) => setCustom(i, e.target.value)}
                />
              </Field>
              {(data.customPlatforms.length > 1 || name) && (
                <button
                  type="button"
                  onClick={() => removeCustom(i)}
                  className="mb-1.5 rounded-lg p-2.5 text-muted hover:bg-paper hover:text-ink"
                  aria-label="Remover casa de apostas"
                >
                  <IconX size={18} />
                </button>
              )}
            </div>
          ))}
          {data.customPlatforms.length < 5 && (
            <button
              type="button"
              onClick={() => update({ customPlatforms: [...data.customPlatforms, ""] })}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
            >
              <IconPlus size={16} /> Adicionar outra casa
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ─── Etapa 3: período ─────────────────────────────────────────────────────
export function PeriodStep({ data, headingRef, onChoose }: { data: WizardData; headingRef: HeadingRef; onChoose: (value: NonNullable<WizardData["period"]>) => void }) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-period" title="Há quanto tempo você aposta nessas casas?" />
      <div role="radiogroup" aria-labelledby="q-period" className="grid grid-cols-2 gap-3">
        {PERIODS.map((p) => (
          <ChoiceCard key={p.value} compact selected={data.period === p.value} onSelect={() => onChoose(p.value)} title={p.label} />
        ))}
      </div>
    </>
  );
}

// ─── Etapa 4: faixa de perda ──────────────────────────────────────────────
export function LossStep({ data, headingRef, onChoose }: { data: WizardData; headingRef: HeadingRef; onChoose: (value: NonNullable<WizardData["lossRange"]>) => void }) {
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-loss"
        title="Quanto você perdeu, mais ou menos?"
        subtitle="Some tudo o que depositou nas casas e não conseguiu sacar. Não precisa ser o valor exato."
      />
      <div role="radiogroup" aria-labelledby="q-loss" className="space-y-2.5">
        {LOSS_RANGES.map((r) => (
          <ChoiceCard key={r.value} compact selected={data.lossRange === r.value} onSelect={() => onChoose(r.value)} title={r.label} />
        ))}
      </div>
    </>
  );
}

// ─── Etapa 5: dados do solicitante ────────────────────────────────────────
export function ContactStep({
  data,
  update,
  headingRef,
  showErrors,
  serverError,
}: {
  data: WizardData;
  update: Update;
  headingRef: HeadingRef;
  showErrors: boolean;
  serverError?: string | null;
}) {
  const errors = showErrors ? contactErrors(data) : {};
  const cpfError = errors.cpf ?? serverError ?? null;
  const savedCpf = Boolean(data.cpfMasked) && !data.cpf;
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-contact" title="Seus dados" subtitle="Para ver o resultado. Usamos apenas para esta solicitação." />
      <div className="space-y-5">
        <Field label="Nome completo" htmlFor="fullName" error={errors.fullName}>
          <TextInput id="fullName" autoComplete="name" maxLength={120} value={data.fullName} onChange={(e) => update({ fullName: e.target.value })} />
        </Field>
        {savedCpf ? (
          <div>
            <p className="block text-sm font-medium text-ink">CPF</p>
            <div className="mt-1.5 flex min-h-[3.25rem] items-center justify-between gap-3 rounded-xl border border-line-strong bg-paper px-3.5">
              <span className="text-base tabular-nums tracking-wide text-ink">{data.cpfMasked}</span>
              <button
                type="button"
                onClick={() => update({ cpfMasked: null, cpf: "" })}
                className="rounded-md px-1.5 py-0.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
              >
                Alterar
              </button>
            </div>
          </div>
        ) : (
          <Field label="CPF" htmlFor="cpf" error={cpfError} hint="O CPF usado nas casas de apostas.">
            <TextInput
              id="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              maxLength={14}
              value={maskCpfInput(data.cpf)}
              onChange={(e) => update({ cpf: cpfDigits(e.target.value).slice(0, 11) })}
              className="tabular-nums tracking-wide"
            />
          </Field>
        )}
        <Field label="WhatsApp" htmlFor="whatsapp" error={errors.whatsapp}>
          <TextInput
            id="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            value={data.whatsapp}
            onChange={(e) => update({ whatsapp: maskPhoneInput(e.target.value) })}
          />
        </Field>
        <Field label="E-mail" htmlFor="email" error={errors.email} hint="Você vai usar este e-mail e o protocolo para acompanhar a solicitação.">
          <TextInput
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            maxLength={160}
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
          />
        </Field>
        <div className="space-y-2.5">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <input
              type="checkbox"
              checked={data.isAdult}
              onChange={(e) => update({ isAdult: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-navy-900"
            />
            <span className="text-[0.95rem] text-ink">Confirmo que tenho 18 anos ou mais.</span>
          </label>
          {errors.isAdult && <p className="text-xs font-medium text-danger-700">{errors.isAdult}</p>}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <input
              type="checkbox"
              checked={data.privacyConsent}
              onChange={(e) => update({ privacyConsent: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-navy-900"
            />
            <span className="text-[0.95rem] leading-relaxed text-ink">
              {PRIVACY_CONSENT_TEXT} Veja a{" "}
              <Link href="/privacidade" target="_blank" className="font-medium text-navy-700 underline underline-offset-2">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
          {errors.privacyConsent && <p className="text-xs font-medium text-danger-700">{errors.privacyConsent}</p>}
        </div>
      </div>
    </>
  );
}

// ─── Resultado na hora ────────────────────────────────────────────────────
function ResultRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-sm text-muted">{label}</dt>
        {onEdit && (
          <button type="button" onClick={onEdit} className="rounded-md px-1.5 py-0.5 text-sm font-medium text-navy-700 hover:bg-navy-50">
            Alterar
          </button>
        )}
      </div>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

export function ResultStep({
  data,
  headingRef,
  platformNames,
  priceCents,
  goTo,
}: {
  data: WizardData;
  headingRef: HeadingRef;
  platformNames: string[];
  priceCents: number | null;
  goTo: (s: Screen) => void;
}) {
  const firstName = data.fullName.trim().split(/\s+/)[0] ?? "";
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-600 text-white">
          <IconCheck size={22} strokeWidth={2.75} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ok-700">{firstName ? `${firstName}, resultado pronto` : "Resultado pronto"}</p>
      </div>
      <StepHeading headingRef={headingRef} id="q-result" title={RESULT_TITLE} subtitle="Confira o resumo do que você informou." />

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
        <dl className="divide-y divide-line px-5">
          <ResultRow label="Primeira solicitação do CPF" onEdit={() => goTo("previous")}>
            <span className="inline-flex items-center gap-1.5 text-ok-700">
              <IconCheck size={17} strokeWidth={2.5} /> Sim, nunca pediu o estorno
            </span>
          </ResultRow>
          <ResultRow label="CPF">
            <span className="tabular-nums tracking-wide">{data.cpfMasked ?? "—"}</span>
          </ResultRow>
          <ResultRow label={platformNames.length === 1 ? "Casa de apostas" : "Casas de apostas"} onEdit={() => goTo("platforms")}>
            {platformNames.join(", ") || "—"}
          </ResultRow>
          <ResultRow label="Tempo apostando" onEdit={() => goTo("period")}>
            {labelFor(PERIODS, data.period)}
          </ResultRow>
        </dl>
        <div className="bg-navy-900 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-white/75">Valor de referência da solicitação</p>
            <button type="button" onClick={() => goTo("loss")} className="rounded-md px-1.5 py-0.5 text-sm font-medium text-white/85 hover:bg-white/10">
              Alterar
            </button>
          </div>
          <p className="mt-0.5 text-[1.7rem] font-semibold leading-tight tracking-tight tabular-nums" data-testid="result-range">
            {labelFor(LOSS_RANGES, data.lossRange)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{RESULT_VALUE_NOTE}</p>

      <section className="mt-6 rounded-2xl border border-navy-100 bg-navy-50 p-5" aria-labelledby="result-next">
        <h2 id="result-next" className="text-base font-semibold text-navy-900">
          Próximos passos
        </h2>
        <ol className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-ink">
          <li className="flex gap-2.5">
            <span className="w-5 shrink-0 font-semibold tabular-nums text-navy-700">1.</span>
            <span>
              Pague a taxa da análise por PIX{priceCents !== null ? <> (<strong className="tabular-nums">{formatBRL(priceCents)}</strong>)</> : null}.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="w-5 shrink-0 font-semibold tabular-nums text-navy-700">2.</span>
            <span>Diga como prefere ser contatado.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="w-5 shrink-0 font-semibold tabular-nums text-navy-700">3.</span>
            <span>{CONTACT_PROMISE}</span>
          </li>
        </ol>
      </section>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{MANUAL_SUPPORT_TEXT}</p>
    </>
  );
}

// ─── Pagamento da taxa por PIX ────────────────────────────────────────────
export type PaymentSettings = {
  /** Gateway e valor configurados. */
  available: boolean;
  priceCents: number | null;
  /** Como o PIX é processado (ou o aviso da demonstração), abaixo do valor. */
  note: string;
};

/** Situação do pagamento fora do PIX em aberto: confirmado, indisponível ou tentativa anterior sem pagamento. */
function PaymentStatusNotice({ payment, available }: { payment: PaymentState | null; available: boolean }) {
  const status = payment?.status ?? "none";
  if (status === "paid") {
    return (
      <Notice tone="ok">
        <span className="flex items-start gap-2">
          <IconCheck size={18} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Pagamento confirmado</strong>
            {payment?.paidAt ? ` em ${formatDateTime(payment.paidAt)}` : ""}
            {payment?.method ? ` · ${paymentMethodLabel(payment.method)}` : ""}.
          </span>
        </span>
      </Notice>
    );
  }
  if (!available) {
    return (
      <Notice tone="warn">
        O pagamento está indisponível no momento. Suas respostas ficam salvas neste aparelho: volte mais tarde para concluir.
      </Notice>
    );
  }
  if (status === "expired") return <Notice tone="warn">O PIX anterior expirou sem pagamento. Gere um novo PIX para pagar.</Notice>;
  if (status === "failed") return <Notice tone="danger">Não foi possível concluir o PIX anterior. Gere um novo PIX para tentar de novo.</Notice>;
  if (status === "cancelled") return <Notice tone="warn">O PIX anterior foi cancelado. Gere um novo PIX para pagar.</Notice>;
  if (status === "refunded") return <Notice tone="warn">O pagamento anterior foi estornado. Para continuar, faça um novo pagamento.</Notice>;
  return null;
}

/** Copia o texto: área de transferência do navegador, com alternativa para navegadores antigos. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** PIX em aberto: QR Code, copia e cola, status e validade. A tela é atualizada sozinha com a confirmação. */
function PixPanel({
  pix,
  demo,
  onSimulate,
  simulating,
}: {
  pix: PixState;
  demo: boolean;
  onSimulate: (outcome: "paid" | "expired") => void;
  simulating: boolean;
}) {
  const [copied, setCopied] = useState<"ok" | "manual" | null>(null);
  const codeRef = useRef<HTMLParagraphElement | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  async function copy() {
    const ok = await copyText(pix.copyPaste);
    if (!ok && codeRef.current) {
      // Sem acesso à área de transferência: deixa o código selecionado para copiar manualmente.
      const range = document.createRange();
      range.selectNodeContents(codeRef.current);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    setCopied(ok ? "ok" : "manual");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 4000);
  }

  return (
    <section aria-labelledby="pix-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="pix-title" className="text-base font-semibold text-ink">
            Pagamento via PIX
          </h2>
          <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-warn-50 px-2.5 py-0.5 text-xs font-semibold text-warn-700">
            <span className="size-1.5 animate-pulse rounded-full bg-warn-700" aria-hidden />
            Aguardando pagamento
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs text-muted">Valor</span>
          <span className="text-xl font-semibold tabular-nums text-ink" data-testid="pix-amount">
            {formatBRL(pix.amountCents)}
          </span>
        </p>
      </header>

      <div className="grid gap-5 p-5 sm:grid-cols-[12.5rem_1fr] sm:items-start">
        <figure className="order-2 mx-auto w-full max-w-[13rem] sm:order-1 sm:max-w-none">
          <img
            src={pix.qrCode}
            alt="QR Code do PIX para pagamento da análise"
            width={200}
            height={200}
            className="aspect-square w-full rounded-xl border border-line bg-white p-2"
          />
          <figcaption className="mt-2 text-center text-xs text-muted">Escaneie com o app do seu banco</figcaption>
        </figure>

        <div className="order-1 min-w-0 sm:order-2">
          <p className="text-sm font-medium text-ink" id="pix-code-label">
            Código PIX copia e cola
          </p>
          <p
            ref={codeRef}
            aria-labelledby="pix-code-label"
            data-testid="pix-copy-paste"
            className="mt-2 max-h-[5.5rem] select-all overflow-y-auto break-all rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-soft"
          >
            {pix.copyPaste}
          </p>
          <Button className="mt-3 w-full" variant={copied === "ok" ? "secondary" : "primary"} onClick={() => void copy()}>
            {copied === "ok" ? <IconCheck size={17} strokeWidth={2.5} /> : <IconCopy size={17} />}
            {copied === "ok" ? "Código PIX copiado" : "Copiar código PIX"}
          </Button>
          <p className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
            {copied === "ok"
              ? "Código PIX copiado. Cole no app do seu banco, na opção PIX copia e cola."
              : copied === "manual"
                ? "Não foi possível copiar automaticamente: o código ficou selecionado para você copiar."
                : ""}
          </p>
          <ol className="mt-2 space-y-1 text-sm leading-relaxed text-ink-soft">
            <li>1. Abra o app do seu banco e escolha pagar com PIX.</li>
            <li>2. Escaneie o QR Code ou cole o código.</li>
            <li>3. Confirme o pagamento: esta tela é atualizada sozinha.</li>
          </ol>
        </div>
      </div>

      <footer className="border-t border-line bg-paper/60 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-medium text-ink" role="status">
          <IconSpinner size={16} className="animate-spin text-navy-700" />
          Aguardando confirmação do pagamento
        </p>
        <dl className="mt-2 grid gap-1 text-xs text-muted">
          {pix.expiresAt && (
            <div>
              <dt className="inline">Válido até </dt>
              <dd className="inline tabular-nums">{formatDateTime(pix.expiresAt)}</dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className="inline">ID da transação: </dt>
            <dd className="inline break-all font-mono" data-testid="pix-transaction">
              {pix.transactionId}
            </dd>
          </div>
        </dl>
      </footer>

      {demo && (
        <div className="border-t border-dashed border-warn-700/30 bg-warn-50 px-5 py-4 text-sm text-warn-700">
          <p>
            <strong>Demonstração:</strong> este PIX é fictício e nenhum valor é cobrado. Simule o resultado:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onSimulate("paid")} loading={simulating}>
              Simular pagamento confirmado
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onSimulate("expired")} disabled={simulating}>
              Simular PIX expirado
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function PaymentStep({
  data,
  update,
  headingRef,
  settings,
  payment,
  showErrors,
  onSimulate,
  simulating,
}: {
  data: WizardData;
  update: Update;
  headingRef: HeadingRef;
  settings: PaymentSettings;
  payment: PaymentState | null;
  showErrors: boolean;
  onSimulate: (outcome: "paid" | "expired") => void;
  simulating: boolean;
}) {
  const paid = payment?.status === "paid";
  const pix = !paid && payment?.status === "pending" ? payment.pix : null;
  const accepted = paid || Boolean(pix) || data.termsAccepted;
  const missingAccept = showErrors && !accepted;
  const retry = payment && ["expired", "failed", "cancelled", "refunded"].includes(payment.status);
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-payment"
        title="Pagamento da taxa"
        subtitle={
          paid
            ? "Pagamento confirmado."
            : pix
              ? "Pague o PIX pelo app do seu banco. A confirmação é automática e esta tela é atualizada sozinha."
              : "Confira o valor, leia o aviso e marque o aceite. Depois, gere o PIX e pague pelo app do seu banco."
        }
      />

      <div className="mb-5 empty:mb-0" aria-live="polite">
        {!pix && <PaymentStatusNotice payment={payment} available={settings.available} />}
      </div>

      {pix ? (
        <PixPanel pix={pix} demo={Boolean(payment?.demo)} onSimulate={onSimulate} simulating={simulating} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface px-5 py-4 shadow-soft">
          <div className="flex items-baseline justify-between gap-4">
            <span>
              <span className="block text-base font-semibold text-ink">Pagamento via PIX</span>
              <span className="text-sm text-ink-soft">{paid ? "Valor pago" : "Taxa da análise"}</span>
            </span>
            <span className="text-2xl font-semibold tabular-nums text-ink" data-testid="analysis-price">
              {settings.priceCents !== null ? formatBRL(settings.priceCents) : "—"}
            </span>
          </div>
          {!paid && (
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
              <IconLock size={14} className="mt-px shrink-0" />
              <span>{settings.note}</span>
            </p>
          )}
        </div>
      )}

      {!pix && !paid && (
        <>
          <section className="mt-4 rounded-2xl border border-navy-100 bg-navy-50 p-5" aria-labelledby="payment-notice-title">
            <p id="payment-notice-title" className="flex items-center gap-2 text-base font-semibold text-navy-900">
              <IconInfo size={19} /> Importante
            </p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{PAYMENT_NOTICE}</p>
          </section>

          <label
            className={cx(
              "mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
              accepted
                ? "border-navy-900 bg-navy-50 shadow-[inset_0_0_0_1px_var(--color-navy-900)]"
                : missingAccept
                  ? "border-danger-700/40 bg-danger-50"
                  : "border-line-strong bg-surface",
            )}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => update({ termsAccepted: e.target.checked })}
              aria-invalid={missingAccept || undefined}
              className="mt-0.5 size-5 shrink-0 accent-navy-900"
            />
            <span className="text-[0.95rem] leading-relaxed text-ink">{SERVICE_TERMS_CHECKBOX}</span>
          </label>
        </>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {payment?.termsAcceptedAt && (pix || paid || !retry)
          ? `Condições aceitas em ${formatDateTime(payment.termsAcceptedAt)}. `
          : "O aceite fica registrado com data e hora ao gerar o PIX. "}
        Leia as condições completas nos{" "}
        <Link href="/termos" target="_blank" className="font-medium text-navy-700 underline underline-offset-2">
          Termos de Uso
        </Link>
        .
      </p>

      <p className="mt-6 border-t border-dashed border-line-strong pt-5 text-sm leading-relaxed text-ink-soft">
        Depois do pagamento, você diz como prefere ser contatado. {CONTACT_PROMISE}
      </p>
    </>
  );
}

// ─── Depois do pagamento: como o cliente prefere seguir ──────────────────
export function PreferencesStep({
  data,
  update,
  headingRef,
  payment,
  showErrors,
}: {
  data: WizardData;
  update: Update;
  headingRef: HeadingRef;
  payment: PaymentState | null;
  showErrors: boolean;
}) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-preferences" title="Pagamento confirmado. Como você prefere seguir?" />
      <div className="mb-7" aria-live="polite">
        <PaymentStatusNotice payment={payment} available />
      </div>
      <PreferenceFields
        value={{ evidence: data.evidence, contactChannel: data.contactChannel, contactPeriod: data.contactPeriod }}
        onChange={update}
        errors={showErrors ? preferenceErrors(data) : {}}
      />
      <p className="mt-8 flex items-start gap-2.5 rounded-2xl border border-navy-100 bg-navy-50 px-5 py-4 text-[0.95rem] font-medium leading-relaxed text-navy-900">
        <IconInfo size={19} className="mt-0.5 shrink-0" />
        {CONTACT_PROMISE}
      </p>
    </>
  );
}
