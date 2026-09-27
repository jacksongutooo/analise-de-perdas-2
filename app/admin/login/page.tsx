import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Logo } from "@/components/site";
import { getAdmin } from "@/lib/auth/admin";
import { config } from "@/lib/env";

export const metadata: Metadata = { title: "Acesso da equipe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect("/admin");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Logo href="/" />
        <div className="mt-8 rounded-[1.5rem] border border-line bg-surface p-6 shadow-soft sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Acesso da equipe</h1>
          <p className="mt-1 text-sm text-muted">Área restrita. Todos os acessos são registrados.</p>
          <AdminLoginForm />
        </div>
        {config.demoMode && (
          <p className="mt-4 rounded-xl bg-warn-50 px-4 py-3 text-xs leading-relaxed text-warn-700">
            DEMO MODE: use o acesso de demonstração exibido ao executar o seed.
          </p>
        )}
      </div>
    </main>
  );
}
