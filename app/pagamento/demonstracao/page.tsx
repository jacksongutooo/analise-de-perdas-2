import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconAlert } from "@/components/icons";
import { PageShell } from "@/components/site";
import { SubmitButton } from "@/components/SubmitButton";
import { LinkButton, Notice } from "@/components/ui";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { decimalToCents, formatBRL } from "@/lib/format";
import { simulateDemoPayment } from "./actions";

export const metadata: Metadata = { title: "Pagamento de demonstração", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  approved: "aprovado",
  rejected: "recusado",
  cancelled: "cancelado",
  refunded: "estornado",
};

/** Checkout SIMULADO: só com DEMO_MODE=true. No site real, esta etapa acontece na página do Mercado Pago. */
export default async function DemoCheckoutPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (!config.demoMode) notFound();
  const { id } = await searchParams;
  const payment = id
    ? await prisma.payment.findUnique({ where: { id }, select: { id: true, status: true, amount: true, provider: true, isDemo: true } })
    : null;
  if (!payment || payment.provider !== "demo" || !payment.isDemo) notFound();
  const amount = decimalToCents(payment.amount) ?? 0;

  return (
    <PageShell showTracking={false}>
      <div className="mt-2 flex items-start gap-3 rounded-2xl border border-warn-700/25 bg-warn-50 px-4 py-3 text-sm text-warn-700">
        <IconAlert size={18} className="mt-0.5 shrink-0" />
        <p>
          <strong>Ambiente de demonstração.</strong> Esta página simula o checkout do gateway de pagamento. Nenhum valor é cobrado.
        </p>
      </div>
      <h1 className="mt-6 text-[1.9rem] font-semibold leading-tight tracking-tight text-ink">Pagamento da análise</h1>
      <div className="mt-5 flex items-baseline justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 shadow-soft">
        <span className="text-sm text-ink-soft">Valor</span>
        <span className="text-2xl font-semibold tabular-nums text-ink">{formatBRL(amount)}</span>
      </div>

      {payment.status === "pending" ? (
        <div className="mt-6 grid gap-3">
          <form action={simulateDemoPayment.bind(null, payment.id, "pix")}>
            <SubmitButton size="lg" className="w-full">
              Pagar com Pix (simulado)
            </SubmitButton>
          </form>
          <form action={simulateDemoPayment.bind(null, payment.id, "credit_card")}>
            <SubmitButton size="lg" variant="secondary" className="w-full">
              Pagar com cartão (simulado)
            </SubmitButton>
          </form>
          <form action={simulateDemoPayment.bind(null, payment.id, "rejected")}>
            <SubmitButton variant="ghost" className="w-full">
              Simular pagamento recusado
            </SubmitButton>
          </form>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Notice tone={payment.status === "approved" ? "ok" : "warn"}>Este pagamento já foi {STATUS_TEXT[payment.status] ?? "processado"}.</Notice>
          <LinkButton href="/analise?pagamento=retorno" size="lg" className="w-full">
            Voltar ao formulário
          </LinkButton>
        </div>
      )}
    </PageShell>
  );
}
