// Pagamento de DEMONSTRAÇÃO: só existe com DEMO_MODE=true. Leva a uma página do próprio site que simula o
// checkout (aprovar com Pix ou cartão, ou recusar). Nenhum valor é cobrado.
import type { PaymentProviderAdapter } from "./types";

export const demoProvider: PaymentProviderAdapter = {
  id: "demo",
  label: "Pagamento de demonstração",
  async createCheckout(input) {
    return { checkoutId: `demo-${input.paymentId}`, checkoutUrl: `/pagamento/demonstracao?id=${encodeURIComponent(input.paymentId)}` };
  },
  // O resultado da demonstração é gravado direto no registro pela página simulada.
  async findByReference() {
    return null;
  },
  async getPayment() {
    return null;
  },
};
