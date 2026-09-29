// PIX de DEMONSTRAÇÃO: só existe com DEMO_MODE=true. Gera um código fictício (não é um PIX válido e nenhum valor
// é cobrado); a confirmação é simulada na própria tela de pagamento, pelos botões da demonstração.
import type { PaymentProviderAdapter } from "./types";

export const demoProvider: PaymentProviderAdapter = {
  id: "demo",
  label: "Pagamento de demonstração",
  async createPixCharge(input) {
    return {
      transactionId: `DEMO-${input.externalRef}`,
      status: "pending",
      providerStatus: "PENDING",
      amountCents: input.amountCents,
      copyPaste: `DEMONSTRACAO-PIX-SEM-VALOR-${input.externalRef}`,
      qrCodeImage: null,
      expiresAt: new Date(Date.now() + input.expiresInDays * 86_400_000),
      audit: { demo: true },
    };
  },
  // O resultado da demonstração é gravado direto no registro pela simulação.
  async getTransaction() {
    return null;
  },
};
