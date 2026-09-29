-- Pagamento da análise por PIX, com a BlackCat no lugar do Mercado Pago.
-- Nenhum dado é apagado: os pagamentos antigos continuam na tabela (provedor "mercadopago"). Os status e as
-- colunas são RENOMEADOS (não recriados), então os valores já gravados são preservados:
--   approved → paid · rejected → failed · provider_payment_id → provider_transaction_id · method → payment_method

-- AlterEnum: novo gateway (o valor "mercadopago" fica para o histórico)
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'blackcat' BEFORE 'mercadopago';

-- AlterEnum: status internos equivalentes a PENDING, PAID, FAILED, CANCELLED e EXPIRED (e REFUNDED)
ALTER TYPE "payment_attempt_status" RENAME VALUE 'approved' TO 'paid';
ALTER TYPE "payment_attempt_status" RENAME VALUE 'rejected' TO 'failed';
ALTER TYPE "payment_attempt_status" ADD VALUE IF NOT EXISTS 'expired' BEFORE 'refunded';

-- AlterTable: identificação da transação, referência interna, dados do PIX e auditoria
ALTER TABLE "payments" RENAME COLUMN "provider_payment_id" TO "provider_transaction_id";
ALTER TABLE "payments" RENAME COLUMN "method" TO "payment_method";
ALTER TABLE "payments" ADD COLUMN     "external_reference" TEXT,
ADD COLUMN     "provider_status" TEXT,
ADD COLUMN     "provider_payload" JSONB,
ADD COLUMN     "pix_copy_paste" TEXT,
ADD COLUMN     "pix_qr_code" TEXT,
ADD COLUMN     "pix_expires_at" TIMESTAMP(3),
ADD COLUMN     "last_checked_at" TIMESTAMP(3);

-- AlterTable: trava curta enquanto a cobrança PIX é gerada (cliques repetidos não criam dois PIX)
ALTER TABLE "case_drafts" ADD COLUMN     "payment_lock_until" TIMESTAMP(3);

-- CreateTable: notificações (webhooks) recebidas, para auditoria e idempotência
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "event" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "status" TEXT,
    "result" TEXT,
    "payload" JSONB,
    "deliveries" INTEGER NOT NULL DEFAULT 1,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_transaction_id_event_key" ON "payment_events"("provider", "transaction_id", "event");

-- CreateIndex
CREATE UNIQUE INDEX "payments_external_reference_key" ON "payments"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_transaction_id_key" ON "payments"("provider", "provider_transaction_id");

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
