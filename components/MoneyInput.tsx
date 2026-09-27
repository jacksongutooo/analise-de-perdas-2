"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import { formatAmount } from "@/lib/format";

const MAX_DIGITS = 11; // até R$ 99.999.999,99

/** Campo monetário no padrão brasileiro: os dígitos preenchem da direita (centavos) para a esquerda. */
export function MoneyInput({
  id,
  value,
  onChange,
  size = "lg",
  ariaLabel,
  ariaDescribedBy,
  autoFocus,
}: {
  id: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  size?: "md" | "lg";
  ariaLabel?: string;
  ariaDescribedBy?: string;
  autoFocus?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex items-center rounded-xl border border-line-strong bg-surface transition-colors focus-within:border-navy-900 focus-within:ring-1 focus-within:ring-navy-900",
      )}
    >
      <span className={cx("pl-4 font-medium text-muted", size === "lg" ? "text-lg" : "text-base")}>R$</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        placeholder="0,00"
        value={value === null ? "" : formatAmount(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
          onChange(digits ? Number(digits) : null);
        }}
        className={cx(
          "w-full min-w-0 bg-transparent px-2 tabular-nums text-ink outline-none placeholder:text-muted/60",
          size === "lg" ? "py-3.5 text-2xl font-semibold" : "py-3 text-base font-medium",
        )}
      />
    </div>
  );
}

/** Versão para formulários com server actions: envia os centavos em um campo oculto. */
export function MoneyField({ name, defaultCents, id, label }: { name: string; defaultCents: number | null; id: string; label: string }) {
  const [value, setValue] = useState<number | null>(defaultCents);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5">
        <MoneyInput id={id} value={value} onChange={setValue} size="md" />
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  );
}
