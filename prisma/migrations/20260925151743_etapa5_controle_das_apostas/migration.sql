-- Etapa 5 do formulário: "As apostas saíram do seu controle?" (sim, em alguns momentos, não).
-- Só adiciona uma coluna opcional: nenhum dado existente é alterado; casos anteriores ficam sem resposta.

-- CreateEnum
CREATE TYPE "control_loss" AS ENUM ('yes', 'sometimes', 'no');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "control_loss" "control_loss";
