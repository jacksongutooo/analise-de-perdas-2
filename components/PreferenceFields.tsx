"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import {
  CONTACT_CHANNELS,
  CONTACT_PERIODS,
  EVIDENCE_OPTIONS,
  type ContactChannelValue,
  type ContactPeriodValue,
  type EvidenceValue,
  type Option,
} from "@/lib/options";

export type PreferenceValues = {
  evidence: EvidenceValue | null;
  contactChannel: ContactChannelValue | null;
  contactPeriod: ContactPeriodValue | null;
};

type Errors = Partial<Record<keyof PreferenceValues, string>>;

/** Cartão de escolha com rádio nativo (funciona também em formulários enviados sem JavaScript). */
function RadioCard<V extends string>({
  name,
  option,
  checked,
  onChange,
  compact,
}: {
  name: string;
  option: Option<V>;
  checked: boolean;
  onChange: (value: V) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy-700",
        compact ? "min-h-14 justify-center px-3 py-3 text-center" : "px-4 py-3.5",
        checked ? "border-navy-900 bg-navy-50 shadow-[inset_0_0_0_1px_var(--color-navy-900)]" : "border-line hover:border-line-strong",
      )}
    >
      <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
      <span className="min-w-0 flex-1">
        <span className={cx("block font-semibold text-ink", compact && "text-[0.95rem]")}>{option.label}</span>
        {option.description && " "}
        {option.description && <span className="mt-0.5 block text-sm leading-snug text-muted">{option.description}</span>}
      </span>
      {!compact && (
        <span
          aria-hidden="true"
          className={cx(
            "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
            checked ? "border-navy-900 bg-navy-900" : "border-line-strong bg-surface",
          )}
        >
          {checked && <span className="size-2 rounded-full bg-white" />}
        </span>
      )}
    </label>
  );
}

function Group({ id, title, error, children }: { id: string; title: string; error?: string; children: ReactNode }) {
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined}>
      <legend id={id} className="mb-3 text-[1.05rem] font-semibold leading-snug text-ink">
        {title}
      </legend>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Preferências depois do pagamento: como comprovar as perdas, por onde e quando falar com a equipe.
 * Os rádios têm nome (evidence, channel, contactPeriod), então também servem num formulário com ação no servidor.
 */
export function PreferenceFields({
  value,
  onChange,
  errors = {},
}: {
  value: PreferenceValues;
  onChange: (patch: Partial<PreferenceValues>) => void;
  errors?: Errors;
}) {
  return (
    <div className="space-y-8">
      <Group id="pref-evidence" title="Como prefere enviar a comprovação?" error={errors.evidence}>
        <div className="space-y-2.5">
          {EVIDENCE_OPTIONS.map((o) => (
            <RadioCard key={o.value} name="evidence" option={o} checked={value.evidence === o.value} onChange={(v) => onChange({ evidence: v })} />
          ))}
        </div>
      </Group>
      <Group id="pref-channel" title="Por onde prefere falar com a equipe?" error={errors.contactChannel}>
        <div className="grid grid-cols-3 gap-2.5">
          {CONTACT_CHANNELS.map((o) => (
            <RadioCard
              key={o.value}
              compact
              name="channel"
              option={o}
              checked={value.contactChannel === o.value}
              onChange={(v) => onChange({ contactChannel: v })}
            />
          ))}
        </div>
      </Group>
      <Group id="pref-period" title="Melhor horário para o contato" error={errors.contactPeriod}>
        <div className="grid grid-cols-3 gap-2.5">
          {CONTACT_PERIODS.map((o) => (
            <RadioCard
              key={o.value}
              compact
              name="contactPeriod"
              option={o}
              checked={value.contactPeriod === o.value}
              onChange={(v) => onChange({ contactPeriod: v })}
            />
          ))}
        </div>
      </Group>
    </div>
  );
}
