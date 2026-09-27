import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconAlert, IconCheck, IconChevronLeft, IconExternal } from "@/components/icons";
import { PageShell } from "@/components/site";
import { SubmitButton } from "@/components/SubmitButton";
import { PaymentConsentForm } from "@/components/tracking/PaymentConsentForm";
import { Notice, buttonClasses } from "@/components/ui";
import { getTrackingCaseId } from "@/lib/auth/tracking";
import { loadClientCase } from "@/lib/cases/client-view";
import { PAYMENT_NOTICE } from "@/lib/comprovabet";
import { config, paymentLinkFor } from "@/lib/env";
import { formatBRL, formatDateTime } from "@/lib/format";
import { acceptServiceTerms, informPaymentDone } from "../actions";

export const metadata: Metadata = { title: "Pagamento da análise", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PagamentoPage({ searchParams }: { searchParams: Promise<{ erro?: string; informado?: string }> }) {
  const sp = await searchParams;
  const caseId = await getTrackingCaseId();
  if (!caseId) redirect("/acompanhar");
  const data = await loadClientCase(caseId);
  if (!data) redirect("/acompanhar");
  // O pagamento só é liberado depois da validação documental.
  if (data.status !== "awaiting_payment") redirect("/acompanhar");
  const paymentLink = paymentLinkFor(data.protocol);

  return (
    <PageShell showTracking={false}>
      <Link href="/acompanhar" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-navy-700 hover:bg-navy-50">
        <IconChevronLeft size={16} /> Caso {data.protocol}
      </Link>

      <h1 className="mt-5 text-[1.9rem] font-semibold leading-tight tracking-tight text-ink">Pagamento da análise</h1>
      <p className="mt-2 text-ink-soft">Seu ComprovaBet foi analisado pela nossa equipe. O próximo passo é o pagamento do serviço de análise.</p>

      {config.analysisPriceCents !== null && (
        <div className="mt-6 flex items-baseline justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 shadow-soft">
          <span className="text-sm text-ink-soft">Valor da análise</span>
          <span className="text-2xl font-semibold tabular-nums text-ink">{formatBRL(config.analysisPriceCents)}</span>
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-warn-700/25 bg-warn-50 p-5">
        <p className="flex items-center gap-2 text-base font-semibold text-warn-700">
          <IconAlert size={19} /> Importante
        </p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{PAYMENT_NOTICE}</p>
      </section>

      {sp.erro === "aceite" && (
        <Notice tone="danger" className="mt-5">
          Para continuar, marque a declaração de aceite.
        </Notice>
      )}

      {!data.termsAcceptedAt ? (
        <PaymentConsentForm action={acceptServiceTerms} />
      ) : (
        <section className="mt-6 space-y-4">
          <p className="flex items-start gap-2 text-sm text-ok-700">
            <IconCheck size={17} strokeWidth={2.5} className="mt-0.5 shrink-0" />
            Condições aceitas em {formatDateTime(data.termsAcceptedAt)}.
          </p>

          {data.paymentStatus === "awaiting_confirmation" ? (
            <Notice tone="info">
              Recebemos seu aviso de pagamento. Assim que a equipe confirmar o recebimento, a análise começa. Você acompanha pelo painel.
            </Notice>
          ) : (
            <>
              {paymentLink ? (
                <a href={paymentLink} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg", "w-full")}>
                  Ir para o pagamento <IconExternal size={18} />
                </a>
              ) : (
                <Notice tone="info">Nossa equipe enviará as instruções de pagamento pelo WhatsApp ou e-mail cadastrados.</Notice>
              )}
              <form action={informPaymentDone}>
                <SubmitButton variant="secondary" size="lg" className="w-full">
                  Já fiz o pagamento
                </SubmitButton>
              </form>
              <p className="text-xs leading-relaxed text-muted">
                Depois do pagamento, a equipe confirma o recebimento. A confirmação aparece no seu acompanhamento.
              </p>
            </>
          )}
        </section>
      )}
    </PageShell>
  );
}
