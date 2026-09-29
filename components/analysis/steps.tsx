"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PAYMENT_NOTICE, SERVICE_TERMS_CHECKBOX, contactWithinText } from "@/lib/comprovabet";
import {
  PRE_ANALYSIS_REVIEW_MESSAGE,
  PRE_CHECK_LABEL,
  PRE_CHECK_ORDER,
  type PreAnalysis,
  type PreAnalysisStatus,
  type PreCheckState,
} from "@/lib/documents/pre-analysis";
import { cpfDigits, maskCpfInput } from "@/lib/cpf";
import { cx } from "@/lib/cx";
import { formatBRL, formatDateTime, maskPhoneInput } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/payments/types";
import {
  BET_TYPES,
  BET_TYPE_SUMMARY,
  CASINO_GAMES,
  CONTROL_LOSS,
  CONTROL_LOSS_SUMMARY,
  GAMBLING_SUPPORT_NOTE,
  MAIN_LOSS_AREAS,
  PERIODS,
  PLATFORMS,
  SITUATIONS,
  SPORTS_KINDS,
  commitmentText,
  labelFor,
  lostControl,
  situationValuesFor,
  type BetTypeValue,
  type ControlLossValue,
} from "@/lib/options";
import { MoneyInput } from "../MoneyInput";
import { IconAlert, IconCheck, IconCopy, IconDice, IconInfo, IconLayers, IconLock, IconPlus, IconSpinner, IconTrophy, IconX } from "../icons";
import { Button, Field, LedgerRow, Notice, TextInput } from "../ui";
import { ChoiceCard } from "./ChoiceCard";
import { contactErrors, currentSituations, declaredLoss, type PaymentState, type PixState, type Screen, type WizardData } from "./state";

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

// ─── Etapa 1 ──────────────────────────────────────────────────────────────
const TYPE_ICONS: Record<BetTypeValue, ReactNode> = {
  sports: <IconTrophy size={22} />,
  casino: <IconDice size={22} />,
  both: <IconLayers size={22} />,
};

export function TypeStep({ data, headingRef, onChoose }: { data: WizardData; headingRef: HeadingRef; onChoose: (v: BetTypeValue) => void }) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-type" title="Onde aconteceram suas perdas?" />
      <div role="radiogroup" aria-labelledby="q-type" className="space-y-3">
        {BET_TYPES.map((t) => (
          <ChoiceCard
            key={t.value}
            selected={data.betType === t.value}
            onSelect={() => onChoose(t.value)}
            title={t.label}
            description={t.description}
            icon={TYPE_ICONS[t.value]}
          />
        ))}
      </div>
    </>
  );
}

export function TypeDetailStep({
  data,
  update,
  headingRef,
  onSingleChoice,
}: {
  data: WizardData;
  update: Update;
  headingRef: HeadingRef;
  onSingleChoice: () => void;
}) {
  if (data.betType === "casino") {
    const toggle = (value: string) =>
      update({ casinoGames: data.casinoGames.includes(value) ? data.casinoGames.filter((g) => g !== value) : [...data.casinoGames, value] });
    return (
      <>
        <StepHeading headingRef={headingRef} id="q-detail" title="Quais jogos utilizava com maior frequência?" subtitle="Você pode marcar mais de um." />
        <div role="group" aria-labelledby="q-detail" className="grid grid-cols-2 gap-3">
          {CASINO_GAMES.map((g) => (
            <ChoiceCard key={g.value} compact multiple selected={data.casinoGames.includes(g.value)} onSelect={() => toggle(g.value)} title={g.label} />
          ))}
        </div>
      </>
    );
  }
  const isSports = data.betType === "sports";
  const options = isSports ? SPORTS_KINDS : MAIN_LOSS_AREAS;
  const current = isSports ? data.sportsKind : data.mainLossArea;
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-detail"
        title={isSports ? "Qual tipo de aposta você utilizava mais?" : "Onde ocorreu a maior parte das suas perdas?"}
      />
      <div role="radiogroup" aria-labelledby="q-detail" className="space-y-3">
        {options.map((o) => (
          <ChoiceCard
            key={o.value}
            compact
            selected={current === o.value}
            onSelect={() => {
              update(isSports ? { sportsKind: o.value } : { mainLossArea: o.value });
              onSingleChoice();
            }}
            title={o.label}
          />
        ))}
      </div>
    </>
  );
}

// ─── Etapa 2 ──────────────────────────────────────────────────────────────
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
      <StepHeading headingRef={headingRef} id="q-platforms" title="Em quais plataformas você apostou?" subtitle="Marque todas que utilizou." />
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
              <Field label={i === 0 ? "Nome da plataforma" : `Nome da plataforma ${i + 1}`} htmlFor={`custom-${i}`} className="flex-1">
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
                  aria-label="Remover plataforma"
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
              <IconPlus size={16} /> Adicionar outra plataforma
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ─── Etapa 3 ──────────────────────────────────────────────────────────────
export function PeriodStep({ data, update, headingRef, year }: { data: WizardData; update: Update; headingRef: HeadingRef; year: number }) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-period" title="Há quanto tempo você utiliza essas plataformas?" />
      <div role="radiogroup" aria-labelledby="q-period" className="grid grid-cols-2 gap-3">
        {PERIODS.map((p) => (
          <ChoiceCard key={p.value} compact selected={data.period === p.value} onSelect={() => update({ period: p.value })} title={p.label} />
        ))}
      </div>
      {data.period && (
        <div className="step-in mt-6 rounded-2xl border border-navy-100 bg-navy-50 px-5 py-4">
          <p className="text-lg font-semibold leading-snug text-navy-900">Vamos analisar o ano de {year}, com base no seu ComprovaBet.</p>
        </div>
      )}
    </>
  );
}

// ─── Etapa 4 ──────────────────────────────────────────────────────────────
export function AmountsStep({ data, update, headingRef, year }: { data: WizardData; update: Update; headingRef: HeadingRef; year: number }) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-deposits" title={`Aproximadamente quanto você depositou em ${year}?`} />
      <MoneyInput id="deposits" ariaLabel="Total depositado" value={data.depositsCents} onChange={(v) => update({ depositsCents: v })} />
      <div className="mt-10">
        <label htmlFor="withdrawals" className="block text-[1.3rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
          E quanto conseguiu sacar em {year}?
        </label>
        <div className="mt-4">
          <MoneyInput id="withdrawals" ariaDescribedBy="withdrawals-hint" value={data.withdrawalsCents} onChange={(v) => update({ withdrawalsCents: v })} />
        </div>
        <p id="withdrawals-hint" className="mt-2 text-sm text-muted">
          Se não sacou nada, deixe em branco.
        </p>
      </div>
    </>
  );
}

export function LossStatement({ data }: { data: WizardData }) {
  const { loss, needsReview } = declaredLoss(data);
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
        <dl className="divide-y divide-dashed divide-line-strong px-5">
          <LedgerRow label="Depósitos informados" value={formatBRL(data.depositsCents ?? 0)} />
          <LedgerRow label="Saques informados" value={`− ${formatBRL(data.withdrawalsCents ?? 0)}`} />
          <LedgerRow label="Saldo nas plataformas" value={`− ${formatBRL(data.hasBalance ? (data.balanceCents ?? 0) : 0)}`} />
        </dl>
        <div className="bg-navy-900 px-5 py-4 text-white">
          <p className="text-sm text-white/70">Perda líquida declarada</p>
          <p className="mt-0.5 text-[2rem] font-semibold leading-tight tracking-tight tabular-nums">{formatBRL(loss)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Estimativa baseada nos valores informados. Esse valor ainda será conferido através dos documentos enviados.
      </p>
      {needsReview && (
        <Notice tone="warn" className="mt-3">
          Os valores informados resultam em um número negativo, por isso a estimativa aparece como zero. Sua solicitação será sinalizada para revisão.
        </Notice>
      )}
    </div>
  );
}

export function BalanceStep({ data, update, headingRef }: { data: WizardData; update: Update; headingRef: HeadingRef }) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-balance" title="Ainda existe saldo disponível nas plataformas?" />
      <div role="radiogroup" aria-labelledby="q-balance" className="grid grid-cols-2 gap-3">
        <ChoiceCard compact selected={data.hasBalance === true} onSelect={() => update({ hasBalance: true })} title="Sim" />
        <ChoiceCard compact selected={data.hasBalance === false} onSelect={() => update({ hasBalance: false, balanceCents: null })} title="Não" />
      </div>
      {data.hasBalance && (
        <div className="step-in mt-6">
          <label htmlFor="balance" className="block text-base font-semibold text-ink">
            Saldo aproximado
          </label>
          <div className="mt-2">
            <MoneyInput id="balance" value={data.balanceCents} onChange={(v) => update({ balanceCents: v })} />
          </div>
        </div>
      )}
      {data.hasBalance !== null && (
        <div className="step-in mt-8">
          <LossStatement data={data} />
        </div>
      )}
    </>
  );
}

// ─── Etapa 5 ──────────────────────────────────────────────────────────────
export function ControlStep({ data, update, headingRef }: { data: WizardData; update: Update; headingRef: HeadingRef }) {
  const choose = (value: ControlLossValue) => {
    // Ao mudar a resposta, ficam só as situações que continuam valendo.
    const allowed = situationValuesFor(value);
    update({ controlLoss: value, situations: data.situations.filter((s) => allowed.includes(s)) });
  };
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-control"
        title="As apostas saíram do seu controle?"
        subtitle="Sua resposta ajuda a entender o seu caso e fica restrita à equipe de análise."
      />
      <div role="radiogroup" aria-labelledby="q-control" className="space-y-3">
        {CONTROL_LOSS.map((o) => (
          <ChoiceCard key={o.value} selected={data.controlLoss === o.value} onSelect={() => choose(o.value)} title={o.label} description={o.description} />
        ))}
      </div>
      {lostControl(data.controlLoss) && (
        <p className="step-in mt-6 rounded-2xl border border-navy-100 bg-navy-50 px-5 py-4 text-[0.95rem] leading-relaxed text-ink">
          {GAMBLING_SUPPORT_NOTE}
        </p>
      )}
    </>
  );
}

export function SituationStep({ data, update, headingRef }: { data: WizardData; update: Update; headingRef: HeadingRef }) {
  const toggle = (value: WizardData["situations"][number]) =>
    update({ situations: data.situations.includes(value) ? data.situations.filter((s) => s !== value) : [...data.situations, value] });
  const options = situationValuesFor(data.controlLoss).map((value) => SITUATIONS.find((s) => s.value === value)!);
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-situation"
        title={lostControl(data.controlLoss) ? "O que aconteceu com você?" : "O que aconteceu?"}
        subtitle="Marque tudo o que se aplica."
      />
      <div role="group" aria-labelledby="q-situation" className="space-y-2.5">
        {options.map((s) => (
          <ChoiceCard key={s.value} compact multiple selected={data.situations.includes(s.value)} onSelect={() => toggle(s.value)} title={s.label} />
        ))}
      </div>
      {currentSituations(data).includes("other") && (
        <div className="step-in mt-5">
          <Field label="Descreva em poucas palavras" htmlFor="situation-other" hint={`${data.situationOther.length}/140 caracteres`}>
            <TextInput
              id="situation-other"
              value={data.situationOther}
              maxLength={140}
              onChange={(e) => update({ situationOther: e.target.value.slice(0, 140) })}
            />
          </Field>
        </div>
      )}
    </>
  );
}

// ─── Etapa 7 ──────────────────────────────────────────────────────────────
export function CommitmentStep({ data, update, headingRef, reviewDays }: { data: WizardData; update: Update; headingRef: HeadingRef; reviewDays: number }) {
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-commitment" title="Durante sua análise" />
      <label
        className={cx(
          "flex cursor-pointer items-start gap-4 rounded-2xl border bg-surface p-5 transition-colors",
          data.commitment ? "border-navy-900 bg-navy-50 shadow-[inset_0_0_0_1px_var(--color-navy-900)]" : "border-line hover:border-line-strong",
        )}
      >
        <input
          type="checkbox"
          checked={data.commitment}
          onChange={(e) => update({ commitment: e.target.checked })}
          className="mt-1 size-5 shrink-0 accent-navy-900"
        />
        <span className="text-[0.98rem] leading-relaxed text-ink">{commitmentText(reviewDays)}</span>
      </label>
      <div className="mt-4 space-y-1.5 text-sm leading-relaxed text-muted">
        <p>Esse compromisso é pessoal e não representa bloqueio técnico das suas contas.</p>
      </div>
      <p className="mt-8 border-t border-dashed border-line-strong pt-5 text-sm leading-relaxed text-ink-soft">
        Se preferir um bloqueio efetivo, a autoexclusão oficial do Governo Federal fica em{" "}
        <a
          href="https://gov.br/autoexclusaoapostas"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-navy-700 underline underline-offset-2"
        >
          gov.br/autoexclusaoapostas
        </a>
        . Ela encerra as contas nas plataformas autorizadas; guarde antes uma cópia dos seus históricos.
      </p>
    </>
  );
}

// ─── Dados do solicitante ─────────────────────────────────────────────────
export function ContactStep({
  data,
  update,
  headingRef,
  showErrors,
  cpfLocked,
  serverError,
}: {
  data: WizardData;
  update: Update;
  headingRef: HeadingRef;
  showErrors: boolean;
  /** Já existe ComprovaBet enviado com este CPF: para trocar o CPF, é preciso remover o arquivo. */
  cpfLocked: boolean;
  serverError?: string | null;
}) {
  const errors = showErrors ? contactErrors(data) : {};
  const cpfError = errors.cpf ?? serverError ?? null;
  const savedCpf = Boolean(data.cpfMasked) && !data.cpf;
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-contact" title="Seus dados" subtitle="Usamos apenas para esta solicitação." />
      <div className="space-y-5">
        <Field label="Nome completo" htmlFor="fullName" error={errors.fullName}>
          <TextInput id="fullName" autoComplete="name" maxLength={120} value={data.fullName} onChange={(e) => update({ fullName: e.target.value })} />
        </Field>
        {savedCpf ? (
          <div>
            <p className="block text-sm font-medium text-ink">CPF</p>
            <div className="mt-1.5 flex min-h-[3.25rem] items-center justify-between gap-3 rounded-xl border border-line-strong bg-paper px-3.5">
              <span className="text-base tabular-nums tracking-wide text-ink">{data.cpfMasked}</span>
              {!cpfLocked && (
                <button
                  type="button"
                  onClick={() => update({ cpfMasked: null, cpf: "" })}
                  className="rounded-md px-1.5 py-0.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
                >
                  Alterar
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {cpfLocked ? "Para alterar o CPF, remova antes o ComprovaBet enviado na próxima etapa." : "O mesmo CPF do seu ComprovaBet."}
            </p>
          </div>
        ) : (
          <Field label="CPF" htmlFor="cpf" error={cpfError} hint="O mesmo CPF do seu ComprovaBet. Usamos para conferir o documento.">
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
        <Field label="E-mail" htmlFor="email" error={errors.email} hint="Você vai usar este e-mail e o protocolo para acompanhar a análise.">
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
        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <input
              type="checkbox"
              checked={data.isAdult}
              onChange={(e) => update({ isAdult: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-navy-900"
            />
            <span className="text-[0.98rem] text-ink">Confirmo que tenho 18 anos ou mais.</span>
          </label>
          {errors.isAdult && <p className="mt-1.5 text-xs font-medium text-danger-700">{errors.isAdult}</p>}
        </div>
      </div>
    </>
  );
}

// ─── Revisão ──────────────────────────────────────────────────────────────
function ReviewRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
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

const Accepted = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 text-ok-700">
    <IconCheck size={17} strokeWidth={2.5} />
    {children}
  </span>
);

export function ReviewStep({
  data,
  headingRef,
  platformNames,
  year,
  goTo,
}: {
  data: WizardData;
  headingRef: HeadingRef;
  platformNames: string[];
  year: number;
  goTo: (s: Screen) => void;
}) {
  const { loss } = declaredLoss(data);
  return (
    <>
      <StepHeading headingRef={headingRef} id="q-review" title="Confira sua solicitação" />
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-5 shadow-soft">
        <ReviewRow label="Seus dados" onEdit={() => goTo("contact")}>
          <span className="block">{data.fullName}</span>
          <span className="block font-normal tabular-nums tracking-wide text-ink-soft">CPF {data.cpfMasked ?? "—"}</span>
          <span className="block font-normal text-ink-soft">{data.email}</span>
          <span className="block font-normal text-ink-soft">{data.whatsapp}</span>
        </ReviewRow>
        <ReviewRow label="Tipo" onEdit={() => goTo("type")}>
          {data.betType ? BET_TYPE_SUMMARY[data.betType] : "—"}
        </ReviewRow>
        <ReviewRow label="Plataformas" onEdit={() => goTo("platforms")}>
          {platformNames.join(", ") || "—"}
        </ReviewRow>
        <ReviewRow label={`Total depositado informado (${year})`} onEdit={() => goTo("amounts")}>
          <span className="tabular-nums">{formatBRL(data.depositsCents ?? 0)}</span>
        </ReviewRow>
        <ReviewRow label={`Total sacado informado (${year})`} onEdit={() => goTo("amounts")}>
          <span className="tabular-nums">{formatBRL(data.withdrawalsCents ?? 0)}</span>
        </ReviewRow>
        {data.hasBalance && (
          <ReviewRow label="Saldo informado" onEdit={() => goTo("balance")}>
            <span className="tabular-nums">{formatBRL(data.balanceCents ?? 0)}</span>
          </ReviewRow>
        )}
        <ReviewRow label="O que aconteceu" onEdit={() => goTo("control")}>
          <span className="block">{data.controlLoss ? CONTROL_LOSS_SUMMARY[data.controlLoss] : "—"}</span>
          {currentSituations(data).map((s) => (
            <span key={s} className="block text-sm font-normal text-ink-soft">
              {s === "other" && data.situationOther.trim() ? `Outro: ${data.situationOther.trim()}` : labelFor(SITUATIONS, s)}
            </span>
          ))}
        </ReviewRow>
        <ReviewRow label="Perda líquida declarada">
          <span className="text-xl font-semibold tabular-nums">{formatBRL(loss)}</span>
          <span className="block text-xs font-normal text-muted">Estimativa baseada nos valores informados.</span>
        </ReviewRow>
        <ReviewRow label="Compromisso voluntário">
          <Accepted>Aceito</Accepted>
        </ReviewRow>
        <ReviewRow label="Tratamento de dados">
          <Accepted>Autorizado</Accepted>
        </ReviewRow>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Em seguida, envie o seu ComprovaBet {year}: ele passa por uma pré-análise automática e, depois, você segue para o pagamento da
        análise.
      </p>
    </>
  );
}

// ─── Pré-análise automática do ComprovaBet ────────────────────────────────
const CHECK_STEP_MS = 520;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

const CHECK_ICON: Record<PreCheckState, { className: string; icon: ReactNode; sr: string }> = {
  ok: { className: "border-ok-600 bg-ok-600 text-white", icon: <IconCheck size={13} strokeWidth={3} />, sr: "conferido" },
  review: { className: "border-navy-600/50 bg-navy-50 text-navy-700", icon: <IconInfo size={13} strokeWidth={2.5} />, sr: "conferência pela equipe" },
  fail: { className: "border-danger-700 bg-danger-50 text-danger-700", icon: <IconX size={13} strokeWidth={3} />, sr: "pendência" },
};

/**
 * Barra da pré-análise: as conferências aparecem uma a uma (cada linha mostra o resultado real do servidor).
 * Sem animação quando o resultado já é conhecido ou quando o aparelho pede menos movimento.
 */
export function AnalysisStep({
  headingRef,
  year,
  result,
  error,
  animate,
  onSettled,
}: {
  headingRef: HeadingRef;
  year: number;
  result: PreAnalysis | null;
  error: string | null;
  animate: boolean;
  /** Chamado quando todas as conferências já estão visíveis. */
  onSettled: () => void;
}) {
  const total = PRE_CHECK_ORDER.length;
  const reduced = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState(animate ? 0 : total);

  useEffect(() => {
    if (!result) return;
    if (!animate || reduced) {
      setRevealed(total);
      return;
    }
    if (revealed >= total) return;
    const timer = window.setTimeout(() => setRevealed((r) => r + 1), CHECK_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [result, revealed, animate, reduced, total]);

  const settled = Boolean(result) && revealed >= total;
  useEffect(() => {
    if (settled) onSettled();
  }, [settled, onSettled]);

  const progress = error ? 0 : result ? Math.round((revealed / total) * 100) : 6;
  const checks = new Map((result?.checks ?? []).map((c) => [c.key, c]));

  return (
    <>
      <StepHeading
        headingRef={headingRef}
        id="q-analysis"
        title={`Pré-análise do seu ComprovaBet ${year}`}
        subtitle="Conferimos automaticamente o documento com as informações que você enviou. Leva poucos segundos."
      />

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft" aria-labelledby="analysis-progress-label">
        <div className="flex items-baseline justify-between gap-3">
          <p id="analysis-progress-label" className="text-sm font-semibold text-ink">
            {error ? "Pré-análise interrompida" : settled ? "Pré-análise concluída" : "Analisando o documento…"}
          </p>
          <span className="text-sm tabular-nums text-muted">{progress}%</span>
        </div>
        <div
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-navy-100"
          role="progressbar"
          aria-labelledby="analysis-progress-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={cx(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              error ? "bg-danger-700" : settled && result?.status === "approved" ? "bg-ok-600" : "bg-navy-900",
              !result && !error && "animate-pulse",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="mt-4 divide-y divide-dashed divide-line">
          {PRE_CHECK_ORDER.map((key, i) => {
            const check = checks.get(key);
            const shown = Boolean(result && check) && i < revealed;
            const active = !error && !shown && i === (result ? revealed : 0);
            const icon = shown && check ? CHECK_ICON[check.state] : null;
            return (
              <li key={key} className="flex gap-3 py-2.5">
                <span
                  className={cx(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    icon ? icon.className : active ? "border-navy-900 text-navy-900" : "border-line-strong text-transparent",
                  )}
                >
                  {icon ? icon.icon : active ? <IconSpinner size={13} className="animate-spin" /> : null}
                </span>
                <div className="min-w-0">
                  <p className={cx("text-sm font-medium", shown || active ? "text-ink" : "text-muted")}>
                    {PRE_CHECK_LABEL[key]}
                    {key === "year" ? ` (${year})` : ""}
                    {icon && <span className="sr-only"> — {icon.sr}</span>}
                  </p>
                  {shown && check && (
                    <p className={cx("text-xs leading-relaxed", check.state === "fail" ? "text-danger-700" : "text-ink-soft")}>{check.detail}</p>
                  )}
                  {active && <p className="text-xs text-muted">Conferindo…</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-5" aria-live="polite">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : settled && result ? (
          result.status === "approved" ? (
            <section className="rounded-2xl border border-ok-600/25 bg-ok-50 p-5">
              <p className="flex items-center gap-2 text-lg font-semibold text-ok-700">
                <IconCheck size={20} strokeWidth={2.5} className="shrink-0" /> Documento aprovado na pré{"\u2011"}análise
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
                Seu ComprovaBet {year} passou pela conferência automática: CPF, ano de referência e tipo do documento conferem com as informações
                enviadas. Siga para o pagamento da análise.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">A análise completa do caso é feita pela nossa equipe depois do pagamento.</p>
            </section>
          ) : result.status === "review" ? (
            <section className="rounded-2xl border border-navy-100 bg-navy-50 p-5">
              <p className="text-lg font-semibold text-navy-900">Pré-análise concluída</p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{PRE_ANALYSIS_REVIEW_MESSAGE}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Você pode seguir para o pagamento. Se tiver o ComprovaBet em PDF (com texto), volte e envie-o para a conferência automática.
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-warn-700/25 bg-warn-50 p-5">
              <p className="flex items-center gap-2 text-lg font-semibold text-warn-700">
                <IconAlert size={20} /> Documento com pendência
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{result.message}</p>
            </section>
          )
        ) : null}
      </div>
    </>
  );
}

// ─── Pagamento da análise por PIX (antes da solicitação) ─────────────────
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
            <span className="mt-0.5 block text-ink-soft">
              {payment?.protocol
                ? `Sua solicitação já está registrada com o protocolo ${payment.protocol}. Toque em Solicitar análise para concluir.`
                : "Toque em Solicitar análise para concluir."}
            </span>
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
  if (status === "refunded") return <Notice tone="warn">O pagamento anterior foi estornado. Para solicitar a análise, faça um novo pagamento.</Notice>;
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
  analysis,
  reviewDays,
  onSimulate,
  simulating,
}: {
  data: WizardData;
  update: Update;
  headingRef: HeadingRef;
  settings: PaymentSettings;
  payment: PaymentState | null;
  showErrors: boolean;
  /** Resultado da pré-análise automática do ComprovaBet. */
  analysis: PreAnalysisStatus | null;
  reviewDays: number;
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
        title="Pagamento da análise"
        subtitle={
          paid
            ? "Pagamento confirmado. Agora é só solicitar a análise."
            : pix
              ? "Pague o PIX pelo app do seu banco. A confirmação é automática e esta tela é atualizada sozinha."
              : "Confira o valor, leia o aviso e marque o aceite. Depois, gere o PIX e pague pelo app do seu banco."
        }
      />

      <div className="mb-5 empty:mb-0" aria-live="polite">
        {!pix && <PaymentStatusNotice payment={payment} available={settings.available} />}
      </div>

      {analysis && analysis !== "blocked" && !pix && (
        <p
          className={cx(
            "mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium",
            analysis === "approved" ? "bg-ok-50 text-ok-700" : "bg-navy-50 text-navy-800",
          )}
        >
          {analysis === "approved" ? (
            <IconCheck size={17} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          ) : (
            <IconInfo size={17} className="mt-0.5 shrink-0" />
          )}
          {analysis === "approved"
            ? "ComprovaBet aprovado na pré-análise automática."
            : "ComprovaBet recebido: a conferência final será feita pela nossa equipe."}
        </p>
      )}

      {pix ? (
        <PixPanel pix={pix} demo={Boolean(payment?.demo)} onSimulate={onSimulate} simulating={simulating} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface px-5 py-4 shadow-soft">
          <div className="flex items-baseline justify-between gap-4">
            <span>
              <span className="block text-base font-semibold text-ink">Pagamento via PIX</span>
              <span className="text-sm text-ink-soft">{paid ? "Valor pago" : "Valor da análise"}</span>
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
        {nextStepsAfterPayment(reviewDays)}
      </p>
    </>
  );
}

/** O que acontece depois do pagamento. */
function nextStepsAfterPayment(reviewDays: number): string {
  return `Depois do pagamento, sua solicitação é encaminhada para a nossa equipe. ${contactWithinText(reviewDays)}`;
}
