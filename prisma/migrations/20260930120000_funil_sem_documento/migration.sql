-- Formulário sem documento: o cliente informa se já pediu o estorno, as casas, o período e a faixa de perda.
-- Depois do pagamento, informa como prefere comprovar e ser contatado; a equipe faz o primeiro contato em até
-- 1 dia útil. Os casos anteriores continuam com o tipo de aposta e os valores exatos que informaram.

-- CreateEnum
CREATE TYPE "loss_range" AS ENUM ('up_to_1k', 'from_1k_to_5k', 'from_5k_to_20k', 'from_20k_to_50k', 'over_50k');

-- CreateEnum
CREATE TYPE "evidence_preference" AS ENUM ('bank_statement', 'comprovabet', 'team_guidance');

-- CreateEnum
CREATE TYPE "contact_channel" AS ENUM ('whatsapp', 'phone', 'email');

-- CreateEnum
CREATE TYPE "contact_period" AS ENUM ('morning', 'afternoon', 'evening');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "contact_channel" "contact_channel",
ADD COLUMN     "contact_deadline" TIMESTAMP(3),
ADD COLUMN     "contact_period" "contact_period",
ADD COLUMN     "contacted_at" TIMESTAMP(3),
ADD COLUMN     "contacted_by_id" TEXT,
ADD COLUMN     "evidence_preference" "evidence_preference",
ADD COLUMN     "first_request_declared" BOOLEAN,
ADD COLUMN     "loss_range" "loss_range",
ADD COLUMN     "preferences_at" TIMESTAMP(3),
ALTER COLUMN "bet_type" DROP NOT NULL,
ALTER COLUMN "declared_deposits" DROP NOT NULL,
ALTER COLUMN "declared_withdrawals" DROP NOT NULL,
ALTER COLUMN "declared_loss" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "cases_contact_deadline_idx" ON "cases"("contact_deadline");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_contacted_by_id_fkey" FOREIGN KEY ("contacted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
