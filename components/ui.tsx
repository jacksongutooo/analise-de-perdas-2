import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "@/lib/cx";
import type { Tone } from "@/lib/status";
import { IconSpinner } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ok";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-700 active:bg-navy-800",
  secondary: "bg-surface text-navy-900 ring-1 ring-inset ring-line-strong hover:bg-navy-50",
  ghost: "text-navy-700 hover:bg-navy-50",
  danger: "bg-surface text-danger-700 ring-1 ring-inset ring-danger-700/30 hover:bg-danger-50",
  ok: "bg-ok-600 text-white hover:bg-ok-700",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45",
    variant === "ghost" ? "tracking-normal" : "uppercase tracking-[0.06em]",
    size === "lg" && "min-h-14 px-7 text-[0.95rem]",
    size === "md" && "min-h-12 px-5 text-[0.84rem]",
    size === "sm" && "min-h-9 px-3 text-[0.72rem]",
    VARIANTS[variant],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; ref?: Ref<HTMLButtonElement> };

export function Button({ variant, size, loading, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading && <IconSpinner size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; variant?: Variant; size?: Size };

export function LinkButton({ href, variant, size, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

const TONES: Record<Tone, string> = {
  neutral: "bg-paper text-ink-soft ring-line-strong",
  info: "bg-navy-50 text-navy-700 ring-navy-100",
  progress: "bg-navy-900 text-white ring-navy-900",
  warn: "bg-warn-50 text-warn-700 ring-warn-700/25",
  ok: "bg-ok-50 text-ok-700 ring-ok-600/25",
  danger: "bg-danger-50 text-danger-700 ring-danger-700/25",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cx("rounded-[1.25rem] border border-line bg-surface p-5 shadow-soft sm:p-6", className)}>{children}</Tag>;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-danger-700">{error}</p>}
    </div>
  );
}

const INPUT =
  "block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-muted/70 transition-colors focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900 disabled:bg-paper";

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(INPUT, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(INPUT, "min-h-24 resize-y", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(INPUT, "appearance-auto pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "ok" | "danger"; children: ReactNode; className?: string }) {
  const styles = {
    info: "border-navy-100 bg-navy-50 text-navy-800",
    warn: "border-warn-700/20 bg-warn-50 text-warn-700",
    ok: "border-ok-600/20 bg-ok-50 text-ok-700",
    danger: "border-danger-700/20 bg-danger-50 text-danger-700",
  }[tone];
  return <div className={cx("rounded-2xl border px-4 py-3 text-sm leading-relaxed", styles, className)}>{children}</div>;
}

/** Linha no estilo "extrato": rótulo à esquerda, valor tabular à direita. */
export function LedgerRow({ label, value, strong, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className={cx("text-sm", strong ? "font-semibold text-ink" : "text-ink-soft")}>
        {label}
        {hint && <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>}
      </dt>
      <dd className={cx("text-right tabular-nums", strong ? "text-lg font-semibold text-ink" : "font-medium text-ink")}>{value}</dd>
    </div>
  );
}
