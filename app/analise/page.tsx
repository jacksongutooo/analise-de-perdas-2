import type { Metadata } from "next";
import { AnalysisWizard } from "@/components/analysis/AnalysisWizard";
import { analysisPrice, paymentProvider } from "@/lib/payments";

export const metadata: Metadata = { title: "Ver se meu CPF pode pedir o estorno" };
// Valor e disponibilidade do PIX lidos do servidor a cada acesso: a tela mostra sempre o valor que será cobrado.
export const dynamic = "force-dynamic";

export default function AnalisePage() {
  const provider = paymentProvider();
  const price = analysisPrice();
  return (
    <AnalysisWizard
      settings={{
        payment: {
          available: Boolean(provider && price),
          priceCents: price?.cents ?? null,
          note:
            provider?.id === "demo"
              ? `O QR Code e o código PIX copia e cola aparecem nesta tela. Nesta demonstração, o PIX é simulado e nenhum valor é cobrado${price?.example ? " (valor de exemplo)" : ""}.`
              : "O QR Code e o código PIX copia e cola aparecem nesta tela. O pagamento é processado pela BlackCat e a confirmação é automática.",
        },
      }}
    />
  );
}
