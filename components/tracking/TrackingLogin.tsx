"use client";

import { useActionState } from "react";
import { trackingLogin, type TrackingLoginState } from "@/app/acompanhar/actions";
import { Button, Field, TextInput } from "../ui";

const INITIAL: TrackingLoginState = { error: null };

export function TrackingLogin() {
  const [state, action, pending] = useActionState(trackingLogin, INITIAL);
  return (
    <div className="step-in">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-ink">Acompanhar análise</h1>
      <p className="mt-2 text-ink-soft">Informe o protocolo e o e-mail usados na solicitação.</p>
      <form action={action} className="mt-7 space-y-5 rounded-[1.5rem] border border-line bg-surface p-5 shadow-soft sm:p-7">
        <Field label="Protocolo" htmlFor="protocol">
          <TextInput
            id="protocol"
            name="protocol"
            required
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ANL-000000"
            maxLength={20}
            defaultValue={state.protocol}
            className="uppercase tracking-wide"
          />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <TextInput
            id="email"
            name="email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            maxLength={160}
            defaultValue={state.email}
          />
        </Field>
        {state.error && (
          <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Acompanhar análise
        </Button>
      </form>
      <p className="mt-5 text-sm leading-relaxed text-muted">
        O protocolo aparece na tela de confirmação do envio, no formato ANL-000000.
      </p>
    </div>
  );
}
