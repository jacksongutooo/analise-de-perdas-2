"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { applyProviderPayment } from "@/lib/payments";

/** Resultado do pagamento de demonstração. Só vale com DEMO_MODE e para pagamentos de demonstração. */
export async function simulateDemoPayment(paymentId: string, outcome: "pix" | "credit_card" | "rejected"): Promise<void> {
  if (!config.demoMode) redirect("/");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { provider: true, isDemo: true, status: true } });
  if (!payment || payment.provider !== "demo" || !payment.isDemo) redirect("/");
  if (payment.status === "pending") {
    await applyProviderPayment(
      paymentId,
      outcome === "rejected"
        ? { status: "rejected", statusDetail: "cartão recusado (simulação)", method: "credit_card", paidAt: null, amountCents: null, providerPaymentId: `demo-${paymentId}` }
        : { status: "approved", statusDetail: "aprovado na demonstração", method: outcome, paidAt: new Date(), amountCents: null, providerPaymentId: `demo-${paymentId}` },
    );
  }
  redirect("/analise?pagamento=retorno");
}
