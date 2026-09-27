import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./site";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-4 sm:px-8 sm:pt-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Última atualização: {updatedAt}</p>
        <div className="mt-8 space-y-8 text-[0.98rem] leading-relaxed text-ink-soft">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-line-strong">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
