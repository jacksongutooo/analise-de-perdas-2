-- Pagamento da análise antes do envio da solicitação, pelo gateway (Mercado Pago) ou, em demonstração, simulado.
-- Só adições: tabela de pagamentos (uma linha por tentativa) e, no rascunho, o aceite das condições e as
-- respostas gravadas ao iniciar o pagamento. Nenhum dado existente é alterado.

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('mercadopago', 'demo');

-- CreateEnum
CREATE TYPE "payment_attempt_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'refunded');

-- AlterTable
ALTER TABLE "case_drafts" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_ip" TEXT,
ADD COLUMN     "terms_user_agent" TEXT,
ADD COLUMN     "terms_version" TEXT;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT,
    "case_id" TEXT,
    "provider" "payment_provider" NOT NULL,
    "status" "payment_attempt_status" NOT NULL DEFAULT 'pending',
    "status_detail" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT,
    "checkout_id" TEXT,
    "checkout_url" TEXT,
    "provider_payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_draft_id_idx" ON "payments"("draft_id");

-- CreateIndex
CREATE INDEX "payments_case_id_idx" ON "payments"("case_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "case_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
