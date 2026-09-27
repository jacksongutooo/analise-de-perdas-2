"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { SERVICE_TERMS_CHECKBOX } from "@/lib/comprovabet";
import { cx } from "@/lib/cx";
import { Button } from "../ui";

function ContinueButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="mt-5 w-full" disabled={!enabled} loading={pending}>
      Continuar para o pagamento
    </Button>
  );
}

/** Aceite obrigatório das condições do serviço: o botão só funciona depois da marcação. */
export function PaymentConsentForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <form action={action} className="mt-6">
      <label
        className={cx(
          "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
          accepted ? "border-navy-900 bg-navy-50 shadow-[inset_0_0_0_1px_var(--color-navy-900)]" : "border-line-strong bg-surface",
        )}
      >
        <input
          type="checkbox"
          name="accept"
          value="yes"
          required
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-navy-900"
        />
        <span className="text-[0.95rem] leading-relaxed text-ink">{SERVICE_TERMS_CHECKBOX}</span>
      </label>
      <p className="mt-2 text-xs text-muted">
        Leia as condições completas nos{" "}
        <Link href="/termos" target="_blank" className="font-medium text-navy-700 underline underline-offset-2">
          Termos de Uso
        </Link>
        .
      </p>
      <ContinueButton enabled={accepted} />
    </form>
  );
}
