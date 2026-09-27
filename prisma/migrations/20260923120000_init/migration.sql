-- CreateEnum
CREATE TYPE "bet_type" AS ENUM ('sports', 'casino', 'both');

-- CreateEnum
CREATE TYPE "usage_period" AS ENUM ('up_to_3m', 'from_3_to_6m', 'from_6_to_12m', 'over_12m');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('submitted', 'documents_received', 'under_review', 'additional_documents', 'eligible', 'not_eligible', 'completed');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('pending', 'valid', 'divergent', 'illegible', 'duplicate', 'manual_review');

-- CreateEnum
CREATE TYPE "document_category" AS ENUM ('deposit_history', 'withdrawal_history', 'financial_history', 'bet_history', 'bank_statement', 'pix_receipt', 'other');

-- CreateEnum
CREATE TYPE "extraction_status" AS ENUM ('not_started', 'processing', 'done', 'failed', 'unsupported');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('deposit', 'withdrawal', 'balance', 'other');

-- CreateEnum
CREATE TYPE "value_source" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('admin', 'analyst');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('open', 'fulfilled', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "is_adult" BOOLEAN NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "betting_platforms" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "betting_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bet_type" "bet_type" NOT NULL,
    "sports_bet_kind" TEXT,
    "casino_games" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "main_loss_area" TEXT,
    "period" "usage_period" NOT NULL,
    "situations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "situation_other" TEXT,
    "declared_deposits" DECIMAL(14,2) NOT NULL,
    "declared_withdrawals" DECIMAL(14,2) NOT NULL,
    "declared_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "declared_loss" DECIMAL(14,2) NOT NULL,
    "declared_needs_review" BOOLEAN NOT NULL DEFAULT false,
    "identified_deposits" DECIMAL(14,2),
    "identified_withdrawals" DECIMAL(14,2),
    "identified_balance" DECIMAL(14,2),
    "identified_loss" DECIMAL(14,2),
    "identified_source" "value_source",
    "validated_loss" DECIMAL(14,2),
    "status" "case_status" NOT NULL DEFAULT 'submitted',
    "assigned_admin_id" TEXT,
    "next_steps" TEXT,
    "privacy_consent_at" TIMESTAMP(3) NOT NULL,
    "privacy_consent_ip" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "review_deadline" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_platforms" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,

    CONSTRAINT "case_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_declarations" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "deposits" DECIMAL(14,2) NOT NULL,
    "withdrawals" DECIMAL(14,2) NOT NULL,
    "has_balance" BOOLEAN NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "raw_result" DECIMAL(14,2) NOT NULL,
    "calculated_loss" DECIMAL(14,2) NOT NULL,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_drafts" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "case_id" TEXT,

    CONSTRAINT "case_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "draft_id" TEXT,
    "platform_id" TEXT,
    "platform_name" TEXT,
    "category" "document_category" NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'pending',
    "uploaded_via" TEXT NOT NULL DEFAULT 'form',
    "request_id" TEXT,
    "duplicate_of_id" TEXT,
    "extraction_status" "extraction_status" NOT NULL DEFAULT 'not_started',
    "extraction_error" TEXT,
    "extracted_summary" JSONB,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_transactions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3),
    "type" "transaction_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "source" "value_source" NOT NULL DEFAULT 'auto',
    "confidence" DOUBLE PRECISION,
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_reviews" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "identified_deposits" DECIMAL(14,2),
    "identified_withdrawals" DECIMAL(14,2),
    "identified_balance" DECIMAL(14,2),
    "identified_loss" DECIMAL(14,2),
    "validated_loss" DECIMAL(14,2),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "from_status" "case_status",
    "to_status" "case_status" NOT NULL,
    "changed_by_id" TEXT,
    "public_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voluntary_commitments" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "aceite_pausa" BOOLEAN NOT NULL,
    "data_aceite" TIMESTAMP(3) NOT NULL,
    "ip_aceite" TEXT,
    "user_agent" TEXT,
    "text_version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voluntary_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "status" "request_status" NOT NULL DEFAULT 'open',
    "requested_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMP(3),

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "admin_role" NOT NULL DEFAULT 'analyst',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "admin_id" TEXT,
    "subject" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "betting_platforms_slug_key" ON "betting_platforms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cases_protocol_key" ON "cases"("protocol");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_created_at_idx" ON "cases"("created_at");

-- CreateIndex
CREATE INDEX "cases_is_demo_idx" ON "cases"("is_demo");

-- CreateIndex
CREATE INDEX "case_platforms_platform_id_idx" ON "case_platforms"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_platforms_case_id_platform_id_key" ON "case_platforms"("case_id", "platform_id");

-- CreateIndex
CREATE INDEX "financial_declarations_case_id_idx" ON "financial_declarations"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_drafts_case_id_key" ON "case_drafts"("case_id");

-- CreateIndex
CREATE INDEX "case_drafts_expires_at_idx" ON "case_drafts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_case_id_idx" ON "documents"("case_id");

-- CreateIndex
CREATE INDEX "documents_draft_id_idx" ON "documents"("draft_id");

-- CreateIndex
CREATE INDEX "documents_sha256_idx" ON "documents"("sha256");

-- CreateIndex
CREATE INDEX "document_transactions_document_id_idx" ON "document_transactions"("document_id");

-- CreateIndex
CREATE INDEX "document_transactions_case_id_idx" ON "document_transactions"("case_id");

-- CreateIndex
CREATE INDEX "case_reviews_case_id_idx" ON "case_reviews"("case_id");

-- CreateIndex
CREATE INDEX "case_notes_case_id_idx" ON "case_notes"("case_id");

-- CreateIndex
CREATE INDEX "status_history_case_id_idx" ON "status_history"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "voluntary_commitments_case_id_key" ON "voluntary_commitments"("case_id");

-- CreateIndex
CREATE INDEX "document_requests_case_id_idx" ON "document_requests"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE INDEX "access_logs_action_created_at_idx" ON "access_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "access_logs_ip_idx" ON "access_logs"("ip");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_platforms" ADD CONSTRAINT "case_platforms_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_platforms" ADD CONSTRAINT "case_platforms_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "betting_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_declarations" ADD CONSTRAINT "financial_declarations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_drafts" ADD CONSTRAINT "case_drafts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "case_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "betting_platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "document_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_transactions" ADD CONSTRAINT "document_transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_transactions" ADD CONSTRAINT "document_transactions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voluntary_commitments" ADD CONSTRAINT "voluntary_commitments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
