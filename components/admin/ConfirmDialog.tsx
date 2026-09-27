"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "../ui";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ok";

function ConfirmButton({ variant, children }: { variant: Variant; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} className="sm:min-w-36">
      {children}
    </Button>
  );
}

/** Fecha o diálogo quando a ação termina (inclusive quando ela recarrega a página com o resultado). */
function CloseWhenSettled({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) dialog.current?.close();
    wasPending.current = pending;
  }, [pending, dialog]);
  return null;
}

/**
 * Botão que abre um diálogo de confirmação antes de executar uma ação importante no painel.
 * O formulário (e os campos extras) ficam dentro do diálogo: nada é enviado sem a confirmação.
 */
export function ConfirmDialog({
  label,
  icon,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  disabledReason,
  title,
  description,
  confirmLabel = "Confirmar",
  confirmVariant = "primary",
  action,
  hidden,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: Variant;
  action: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          dialog.current?.showModal();
          // Foco inicial em "Cancelar": evita abrir o teclado no celular e confirmações acidentais com Enter.
          cancel.current?.focus();
        }}
      >
        {icon}
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-label={title}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-soft backdrop:bg-ink/45"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <form action={action} className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
          <h2 className="text-lg font-semibold leading-snug">{title}</h2>
          {description && <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">{description}</div>}
          {hidden && Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          {children && <div className="mt-4 space-y-3">{children}</div>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancel} type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <ConfirmButton variant={confirmVariant}>{confirmLabel}</ConfirmButton>
          </div>
          <CloseWhenSettled dialog={dialog} />
        </form>
      </dialog>
    </>
  );
}
