"use client";

import { useActionState } from "react";
import { adminLogin, type AdminLoginState } from "@/app/admin/login/actions";
import { Button, Field, TextInput } from "../ui";

const INITIAL: AdminLoginState = { error: null };

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLogin, INITIAL);
  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="E-mail" htmlFor="email">
        <TextInput id="email" name="email" type="email" required autoComplete="username" autoCapitalize="none" defaultValue={state.email} />
      </Field>
      <Field label="Senha" htmlFor="password">
        <TextInput id="password" name="password" type="password" required autoComplete="current-password" />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        Entrar
      </Button>
    </form>
  );
}
