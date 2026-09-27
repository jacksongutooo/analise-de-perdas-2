// Contrato dos provedores de pagamento. Hoje: Mercado Pago (real) e demonstração (simulado, só com DEMO_MODE).

export type PaymentStatusValue = "pending" | "approved" | "rejected" | "cancelled" | "refunded";

/** Valor usado só na demonstração quando ANALYSIS_PRICE não está configurado. */
export const DEMO_PRICE_CENTS = 9_700;

export type CheckoutInput = {
  /** Id do nosso registro de pagamento: vai como referência externa para conciliar com o gateway. */
  paymentId: string;
  amountCents: number;
  description: string;
  payer: { name: string; email: string };
  /** Para onde o cliente volta depois de pagar (ou desistir). */
  returnUrl: string;
  /** Endereço das notificações do gateway (webhook), quando o site tem endereço público. */
  notificationUrl: string | null;
};

export type ProviderPayment = {
  providerPaymentId: string;
  status: PaymentStatusValue;
  statusDetail: string | null;
  method: string | null;
  paidAt: Date | null;
  amountCents: number | null;
  /** Referência externa enviada no checkout (id do nosso registro de pagamento). */
  reference: string | null;
};

export interface PaymentProviderAdapter {
  id: "mercadopago" | "demo";
  /** Nome exibido ao cliente e à equipe. */
  label: string;
  createCheckout(input: CheckoutInput): Promise<{ checkoutId: string; checkoutUrl: string }>;
  /** Pagamento mais relevante ligado à referência (aprovado, se houver; senão o mais recente). */
  findByReference(reference: string): Promise<ProviderPayment | null>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  prepaid_card: "Cartão pré-pago",
  account_money: "Saldo Mercado Pago",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABEL[method] ?? method;
}
