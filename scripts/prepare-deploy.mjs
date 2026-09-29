// Roda antes do "prisma migrate deploy" (npm run vercel-build e npm run db:deploy). Em um projeto e um banco em dia,
// não faz nada. Nunca apaga dados.
//
// Arquivos: remove arquivos de versões anteriores que não existem mais nesta versão (checkout e webhook do gateway
// antigo e a migration 20260924100000_add_full_review_payments). Se ficarem no repositório por engano (o upload pelo
// GitHub não apaga arquivos), quebrariam o build.
//
// Banco:
// 1) Migration que falhou em um deploy anterior: no PostgreSQL cada migration roda numa transação, então a falha não
//    deixa efeitos. Ela é marcada como revertida (como "prisma migrate resolve --rolled-back") e roda de novo.
// 2) Migration 20260924100000_add_full_review_payments, de uma versão antiga do projeto que não é mais usada: o tipo
//    "payment_status" e a tabela "payments" que ela criou têm o mesmo nome dos atuais e são renomeados (os dados ficam
//    guardados em "payments_versao_anterior"). A migration 20260929120000_limpeza_pagamentos_legados termina a limpeza.
import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prismaClient from "@prisma/client";

const { PrismaClient } = prismaClient;
const OBSOLETE_MIGRATION = "20260924100000_add_full_review_payments";
// Mesma trava usada pelo "prisma migrate deploy": nunca mexe no banco enquanto outro deploy aplica migrations.
const PRISMA_MIGRATE_LOCK = 72707369;
const log = (message) => console.log(`[prepare-deploy] ${message}`);

// ─── Arquivos de versões anteriores ───────────────────────────────────────
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBSOLETE_PATHS = [
  `prisma/migrations/${OBSOLETE_MIGRATION}`,
  "app/pagamento/demonstracao",
  "app/api/payments/webhook/mercadopago",
  "lib/payments/mercadopago.ts",
];
for (const relative of OBSOLETE_PATHS) {
  const full = path.join(root, relative);
  if (!existsSync(full)) continue;
  rmSync(full, { recursive: true, force: true });
  log(`removido (arquivo de versão anterior): ${relative}`);
}
// Pastas que ficaram vazias.
for (const relative of ["app/pagamento"]) {
  const full = path.join(root, relative);
  if (existsSync(full) && readdirSync(full).length === 0) rmdirSync(full);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  log("DATABASE_URL não definida: nada a preparar.");
  process.exit(0);
}

const prisma = new PrismaClient({ datasourceUrl: url });

async function exists(tx, sql, ...params) {
  const rows = await tx.$queryRawUnsafe(`SELECT EXISTS (${sql}) AS "ok"`, ...params);
  return Boolean(rows[0]?.ok);
}

try {
  const hasHistory = await exists(prisma, `SELECT 1 FROM pg_class WHERE relname = '_prisma_migrations' AND relkind = 'r'`);
  if (!hasHistory) {
    log("Banco novo: as migrations serão aplicadas do início.");
  } else {
    const actions = await prisma.$transaction(
      async (tx) => {
        const done = [];
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${PRISMA_MIGRATE_LOCK})`);

        const obsoleteApplied = await exists(
          tx,
          `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
          OBSOLETE_MIGRATION,
        );
        if (obsoleteApplied) {
          const oldPayments = await exists(
            tx,
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'payments' AND column_name = 'final_amount'`,
          );
          if (oldPayments) {
            await tx.$executeRawUnsafe(`ALTER TABLE "payments" RENAME TO "payments_versao_anterior"`);
            await tx.$executeRawUnsafe(`ALTER TABLE "payments_versao_anterior" RENAME CONSTRAINT "payments_pkey" TO "payments_versao_anterior_pkey"`);
            for (const name of ["payments_case_id_key", "payments_transaction_id_key", "payments_status_idx"]) {
              await tx.$executeRawUnsafe(`ALTER INDEX IF EXISTS "${name}" RENAME TO "${name.replace("payments_", "payments_versao_anterior_")}"`);
            }
            if (await exists(tx, `SELECT 1 FROM pg_constraint WHERE conname = 'payments_case_id_fkey' AND conrelid = 'payments_versao_anterior'::regclass`)) {
              await tx.$executeRawUnsafe(`ALTER TABLE "payments_versao_anterior" RENAME CONSTRAINT "payments_case_id_fkey" TO "payments_versao_anterior_case_id_fkey"`);
            }
            done.push('tabela "payments" da versão anterior renomeada para "payments_versao_anterior"');
          }
          const oldStatusType = await exists(
            tx,
            `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'payment_status' AND e.enumlabel = 'processing'`,
          );
          if (oldStatusType) {
            await tx.$executeRawUnsafe(`ALTER TYPE "payment_status" RENAME TO "payment_status_versao_anterior"`);
            done.push('tipo "payment_status" da versão anterior renomeado');
          }
          const oldMethodType = await exists(
            tx,
            `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'payment_method' AND e.enumlabel = 'standard'`,
          );
          if (oldMethodType) {
            await tx.$executeRawUnsafe(`ALTER TYPE "payment_method" RENAME TO "payment_method_versao_anterior"`);
            done.push('tipo "payment_method" da versão anterior renomeado');
          }
          await tx.$executeRawUnsafe(
            `UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE migration_name = $1 AND rolled_back_at IS NULL`,
            OBSOLETE_MIGRATION,
          );
          done.push(`migration ${OBSOLETE_MIGRATION} (versão anterior) marcada como revertida`);
        }

        const failed = await tx.$queryRawUnsafe(
          `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at`,
        );
        if (failed.length) {
          await tx.$executeRawUnsafe(`UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
          const names = failed.map((f) => f.migration_name);
          const retry = names.filter((name) => name !== OBSOLETE_MIGRATION);
          if (retry.length) done.push(`migrations com falha em deploy anterior liberadas para rodar de novo: ${retry.join(", ")}`);
          if (names.includes(OBSOLETE_MIGRATION)) done.push(`migration ${OBSOLETE_MIGRATION} (versão anterior, com falha) marcada como revertida`);
        }
        return done;
      },
      { timeout: 60_000, maxWait: 60_000 },
    );
    if (actions.length) for (const action of actions) log(action);
    else log("Banco em dia: nada a preparar.");
  }
} catch (error) {
  console.error("[prepare-deploy] Falha ao preparar o banco:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
