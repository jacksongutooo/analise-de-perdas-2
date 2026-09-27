-- Pré-análise automática do ComprovaBet (antes do pagamento). Só adiciona colunas opcionais:
-- casos e rascunhos anteriores continuam sem resultado de pré-análise.

-- AlterTable
ALTER TABLE "case_drafts" ADD COLUMN     "pre_analysis" JSONB;

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "pre_analysis" JSONB;
