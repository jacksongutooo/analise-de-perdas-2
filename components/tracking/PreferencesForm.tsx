"use client";

import { useState } from "react";
import { saveTrackingPreferences } from "@/app/acompanhar/actions";
import { PreferenceFields, type PreferenceValues } from "../PreferenceFields";
import { SubmitButton } from "../SubmitButton";

/** Preferências de contato no acompanhamento (quem fechou a página depois de pagar, ou quer mudar a escolha). */
export function PreferencesForm({ initial, submitLabel }: { initial: PreferenceValues; submitLabel: string }) {
  const [value, setValue] = useState<PreferenceValues>(initial);
  const complete = Boolean(value.evidence && value.contactChannel && value.contactPeriod);
  return (
    <form action={saveTrackingPreferences} className="space-y-6">
      <PreferenceFields value={value} onChange={(patch) => setValue((current) => ({ ...current, ...patch }))} />
      <div>
        <SubmitButton size="lg" className="w-full">
          {submitLabel}
        </SubmitButton>
        {!complete && <p className="mt-2 text-center text-xs text-muted">Escolha uma opção em cada pergunta.</p>}
      </div>
    </form>
  );
}
