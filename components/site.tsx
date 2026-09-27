import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { site } from "@/lib/site";
import { IconDocCheck } from "./icons";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-lg text-ink" aria-label={site.name}>
      <span className="grid size-9 place-items-center rounded-[0.7rem] bg-navy-900 text-white">
        <IconDocCheck size={19} />
      </span>
      <span className={cx("text-[0.98rem] font-semibold tracking-tight", compact && "hidden sm:inline")}>{site.name}</span>
    </Link>
  );
}

export function SiteHeader({ showTracking = true }: { showTracking?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Logo />
      {showTracking && (
        <Link href="/acompanhar" className="rounded-lg px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50">
          Acompanhar análise
        </Link>
      )}
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            © {year} {site.legalName || site.name}
          </span>
          {site.cnpj && <span>CNPJ {site.cnpj}</span>}
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Informações legais">
          <Link href="/privacidade" className="hover:text-ink">
            Política de Privacidade
          </Link>
          <Link href="/termos" className="hover:text-ink">
            Termos de Uso
          </Link>
          <Link href="/acompanhar" className="hover:text-ink">
            Acompanhar análise
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PageShell({ children, showTracking = true }: { children: ReactNode; showTracking?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader showTracking={showTracking} />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-16 pt-4 sm:pt-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
