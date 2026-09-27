import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { IconLogout } from "@/components/icons";
import { Logo } from "@/components/site";
import { requireAdmin } from "@/lib/auth/admin";
import { adminLogout } from "../login/actions";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-6 sm:px-6">
          <Logo href="/admin" compact />
          <AdminNav />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted md:inline">{admin.name}</span>
            <form action={adminLogout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper hover:text-ink"
              >
                <IconLogout size={16} /> Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
