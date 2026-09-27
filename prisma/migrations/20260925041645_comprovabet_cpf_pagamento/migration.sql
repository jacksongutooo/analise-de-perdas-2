-- ComprovaBet 2025 como documento principal, CPF do solicitante e pagamento da análise.
-- Migration incremental: só acrescenta tipos, valores e colunas. Nenhum dado existente é apagado.

-- CreateEnum
CREATE TYPE "cpf_check_status" AS ENUM ('pending', 'match', 'mismatch', 'manual_match');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('not_applicable', 'pending', 'awaiting_confirmation', 'confirmed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "case_status" ADD VALUE 'awaiting_payment';
ALTER TYPE "case_status" ADD VALUE 'payment_confirmed';

-- AlterEnum
ALTER TYPE "document_category" ADD VALUE 'comprovabet';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "document_status" ADD VALUE 'in_review';
ALTER TYPE "document_status" ADD VALUE 'invalid';
ALTER TYPE "document_status" ADD VALUE 'complement_required';
ALTER TYPE "document_status" ADD VALUE 'cpf_mismatch';

-- AlterTable
ALTER TABLE "case_drafts" ADD COLUMN     "cpf" TEXT;

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "payment_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "payment_confirmed_by_id" TEXT,
ADD COLUMN     "payment_reference" TEXT,
ADD COLUMN     "payment_status" "payment_status" NOT NULL DEFAULT 'not_applicable';

-- Casos já existentes não passaram pela etapa de pagamento: ficam como "não se aplica".
-- A partir daqui, novos casos começam com o pagamento pendente.
ALTER TABLE "cases" ALTER COLUMN "payment_status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "check_details" JSONB,
ADD COLUMN     "cpf_check" "cpf_check_status",
ADD COLUMN     "cpf_check_note" TEXT,
ADD COLUMN     "cpf_checked_at" TIMESTAMP(3),
ADD COLUMN     "reference_year" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cpf" TEXT;

-- CreateTable
CREATE TABLE "service_agreements" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "terms_version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_agreements_case_id_idx" ON "service_agreements"("case_id");

-- CreateIndex
CREATE INDEX "users_cpf_idx" ON "users"("cpf");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_payment_confirmed_by_id_fkey" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
