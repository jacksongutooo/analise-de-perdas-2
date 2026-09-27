import type { Metadata } from "next";
import { AnalysisWizard } from "@/components/analysis/AnalysisWizard";
import { config } from "@/lib/env";
import { analysisPrice, paymentProvider } from "@/lib/payments";

export const metadata: Metadata = { title: "Iniciar análise" };

export default async function AnalisePage({ searchParams }: { searchParams: Promise<{ pagamento?: string }> }) {
  const sp = await searchParams;
  const provider = paymentProvider();
  const price = analysisPrice();
  return (
    <AnalysisWizard
      returning={sp.pagamento === "retorno"}
      settings={{
        maxUploadMb: config.maxUploadMb,
        reviewDays: config.reviewDays,
        comprovabetYear: config.comprovabetYear,
        payment: {
          available: Boolean(provider && price),
          priceCents: price?.cents ?? null,
          note:
            provider?.id === "demo"
              ? `Pix ou cartão de crédito. Nesta demonstração, o pagamento é simulado${price?.example ? " e o valor é de exemplo" : ""}.`
              : provider?.id === "mercadopago"
                ? "Pix ou cartão de crédito, com pagamento processado pelo Mercado Pago. Os dados do cartão não passam pelo site."
                : "Pix ou cartão de crédito.",
        },
      }}
    />
  );
}
