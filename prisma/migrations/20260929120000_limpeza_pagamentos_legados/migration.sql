-- Limpeza de versões anteriores do pagamento. Em um banco novo, nada muda. Em um banco que passou por versões
-- anteriores do projeto, deixa os tipos e as colunas iguais ao schema atual, sem apagar dados em uso:
--   1. Gateway: o tipo "payment_provider" passa a ter só 'blackcat' e 'demo'. Se existir pagamento de outro
--      gateway, a migration para com uma mensagem (nada é apagado).
--   2. Colunas de checkout de gateways anteriores, sem uso no PIX, saem da tabela "payments".
--   3. Status de uma versão antiga do fluxo (análise preliminar, aguardando pagamento, análise completa) passam para
--      os status atuais equivalentes, e o tipo "case_status" fica com os valores do schema atual.
--   4. Colunas extras dessa versão antiga em "cases" saem quando estão vazias; com dados, ficam guardadas.
--   5. A tabela de pagamentos dessa versão antiga (renomeada por scripts/prepare-deploy.mjs) sai quando está vazia.

-- 1. Gateways
DO $$
DECLARE
  current_labels text[];
BEGIN
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO current_labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'payment_provider';

  IF current_labels IS DISTINCT FROM ARRAY['blackcat', 'demo'] THEN
    IF EXISTS (SELECT 1 FROM "payments" WHERE "provider"::text NOT IN ('blackcat', 'demo'))
      OR EXISTS (SELECT 1 FROM "payment_events" WHERE "provider"::text NOT IN ('blackcat', 'demo')) THEN
      RAISE EXCEPTION 'Há pagamentos de um gateway anterior na tabela "payments". Revise esses registros antes de continuar.';
    END IF;
    ALTER TYPE "payment_provider" RENAME TO "payment_provider_anterior";
    CREATE TYPE "payment_provider" AS ENUM ('blackcat', 'demo');
    ALTER TABLE "payments" ALTER COLUMN "provider" TYPE "payment_provider" USING "provider"::text::"payment_provider";
    ALTER TABLE "payment_events" ALTER COLUMN "provider" TYPE "payment_provider" USING "provider"::text::"payment_provider";
    DROP TYPE "payment_provider_anterior";
  END IF;
END $$;

-- 2. Colunas de checkout
ALTER TABLE "payments" DROP COLUMN IF EXISTS "checkout_id",
DROP COLUMN IF EXISTS "checkout_url";

-- 3. Status da versão antiga do fluxo → status atuais
UPDATE "cases" SET "status" = 'documents_received' WHERE "status"::text = 'preliminary_review';
UPDATE "cases" SET "status" = 'awaiting_payment' WHERE "status"::text = 'waiting_payment';
UPDATE "cases" SET "status" = 'under_review' WHERE "status"::text = 'full_review';
UPDATE "status_history" SET "from_status" = 'documents_received' WHERE "from_status"::text = 'preliminary_review';
UPDATE "status_history" SET "from_status" = 'awaiting_payment' WHERE "from_status"::text = 'waiting_payment';
UPDATE "status_history" SET "from_status" = 'under_review' WHERE "from_status"::text = 'full_review';
UPDATE "status_history" SET "to_status" = 'documents_received' WHERE "to_status"::text = 'preliminary_review';
UPDATE "status_history" SET "to_status" = 'awaiting_payment' WHERE "to_status"::text = 'waiting_payment';
UPDATE "status_history" SET "to_status" = 'under_review' WHERE "to_status"::text = 'full_review';

DO $$
DECLARE
  current_labels text[];
  expected_labels text[] := ARRAY['submitted', 'documents_received', 'under_review', 'additional_documents', 'eligible',
    'not_eligible', 'completed', 'awaiting_payment', 'payment_confirmed'];
BEGIN
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO current_labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'case_status';

  IF current_labels IS DISTINCT FROM expected_labels THEN
    ALTER TYPE "case_status" RENAME TO "case_status_anterior";
    CREATE TYPE "case_status" AS ENUM ('submitted', 'documents_received', 'under_review', 'additional_documents',
      'eligible', 'not_eligible', 'completed', 'awaiting_payment', 'payment_confirmed');
    ALTER TABLE "cases" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "cases" ALTER COLUMN "status" TYPE "case_status" USING "status"::text::"case_status";
    ALTER TABLE "cases" ALTER COLUMN "status" SET DEFAULT 'submitted';
    ALTER TABLE "status_history" ALTER COLUMN "from_status" TYPE "case_status" USING "from_status"::text::"case_status",
      ALTER COLUMN "to_status" TYPE "case_status" USING "to_status"::text::"case_status";
    DROP TYPE "case_status_anterior";
  END IF;
END $$;

-- 4. Colunas extras da versão antiga em "cases" (só saem se estiverem vazias)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'cases' AND column_name = 'preliminary_index') THEN
    IF NOT EXISTS (SELECT 1 FROM "cases"
                   WHERE "preliminary_index" <> 0 OR "full_review_started_at" IS NOT NULL
                      OR "estimated_min_date" IS NOT NULL OR "estimated_max_date" IS NOT NULL) THEN
      ALTER TABLE "cases" DROP COLUMN "preliminary_index", DROP COLUMN "full_review_started_at",
        DROP COLUMN "estimated_min_date", DROP COLUMN "estimated_max_date";
    ELSE
      RAISE NOTICE 'Colunas da versão anterior em "cases" mantidas: há dados nelas.';
    END IF;
  END IF;
END $$;

-- 5. Tabela de pagamentos da versão antiga (só sai se estiver vazia)
DO $$
BEGIN
  IF to_regclass('payments_versao_anterior') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "payments_versao_anterior") THEN
      DROP TABLE "payments_versao_anterior";
      DROP TYPE IF EXISTS "payment_status_versao_anterior";
      DROP TYPE IF EXISTS "payment_method_versao_anterior";
    ELSE
      RAISE NOTICE 'Tabela payments_versao_anterior mantida: há registros nela.';
    END IF;
  END IF;
END $$;
