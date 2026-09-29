// Contrato do gateway de pagamento. Hoje: BlackCat (PIX) e, só com DEMO_MODE, o PIX simulado da demonstração.
// Este arquivo não tem dependências do servidor (usado também no navegador).

/** Status interno do pagamento: equivalentes a PENDING, PAID, FAILED, CANCELLED e EXPIRED (e REFUNDED, estorno). */
export type PaymentStatusValue = "pending" | "paid" | "failed" | "cancelled" | "expired" | "refunded";

export type PaymentProviderId = "blackcat" | "demo";

/** Valor usado só na demonstração quando ANALYSIS_PRICE não está configurado. */
export const DEMO_PRICE_CENTS = 9_700;

export type PixChargeInput = {
  /** Referência única interna do pedido (externalRef): concilia a transação do gateway com o nosso registro. */
  externalRef: string;
  /** Valor em centavos, sempre definido pelo servidor. */
  amountCents: number;
  /** Nome do item na cobrança (serviço digital). */
  title: string;
  customer: { name: string; email: string; phone: string; cpf: string };
  /** Endereço das notificações (webhook), quando o site tem endereço público (https). */
  postbackUrl: string | null;
  expiresInDays: number;
};

/** Cobrança PIX criada no gateway. */
export type PixCharge = {
  transactionId: string;
  status: PaymentStatusValue;
  /** Status como veio do gateway (ex.: PENDING). */
  providerStatus: string | null;
  amountCents: number | null;
  /** Código PIX copia e cola. */
  copyPaste: string;
  /** QR Code como imagem (data URI), quando o gateway devolve a imagem. */
  qrCodeImage: string | null;
  expiresAt: Date | null;
  /** Dados da resposta guardados para auditoria (sem dados do cliente). */
  audit: Record<string, unknown>;
};

/** Situação de uma transação consultada no gateway: é a confirmação real do pagamento. */
export type ProviderTransaction = {
  transactionId: string;
  status: PaymentStatusValue;
  providerStatus: string | null;
  paymentMethod: string | null;
  amountCents: number | null;
  paidAt: Date | null;
  audit: Record<string, unknown>;
};

export interface PaymentProviderAdapter {
  id: "blackcat" | "demo";
  /** Nome exibido à equipe. */
  label: string;
  createPixCharge(input: PixChargeInput): Promise<PixCharge>;
  /** Consulta a transação no gateway. null: transação não encontrada (ou sem consulta, na demonstração). */
  getTransaction(transactionId: string): Promise<ProviderTransaction | null>;
}

export const PROVIDER_LABEL: Record<PaymentProviderId, string> = {
  blackcat: "BlackCat",
  demo: "Pagamento de demonstração",
};

export function providerLabel(id: string): string {
  return PROVIDER_LABEL[id as PaymentProviderId] ?? id;
}

/** Formas de pagamento aceitas. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABEL[method.toLowerCase()] ?? method;
}

/** Mensagem ao cliente quando a cobrança não pode ser criada (o erro técnico fica só no log do servidor). */
export const PIX_ERROR_MESSAGE = "Não foi possível gerar o PIX agora. Tente novamente em alguns instantes.";
