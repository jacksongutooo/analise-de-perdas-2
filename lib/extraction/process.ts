import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { centsToDecimal, decimalToCents } from "@/lib/format";
import { getStorage } from "@/lib/storage";
import { detectPlatformName, plain } from "./normalize";
import { readCsvRows, readPdfLines, readXlsxSheets } from "./readers";
import { extractFromRows, type ExtractionResult } from "./table";
import { extractFromLines } from "./text";

// Arquitetura de leitura: arquivo → leitor (CSV/XLSX/PDF) → regras → movimentações + resumo.
// Imagens ficam para conferência manual (um provedor de OCR pode ser plugado em extractFromBuffer).

export type ExtractionSummary = {
  engine: "csv" | "xlsx" | "pdf";
  deposits: { count: number; totalCents: number };
  withdrawals: { count: number; totalCents: number };
  balanceCents: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  coveredDays: number | null;
  detectedPlatform: string | null;
  statedTotals?: { depositsCents?: number; withdrawalsCents?: number };
  warnings: string[];
};

async function extractFromBuffer(buf: Buffer, mime: string): Promise<{ engine: ExtractionSummary["engine"]; result: ExtractionResult; text: string }> {
  if (mime === "text/csv") {
    const rows = await readCsvRows(buf);
    return { engine: "csv", result: extractFromRows(rows), text: rows.slice(0, 60).flat().join(" ") };
  }
  if (mime.includes("spreadsheetml")) {
    const sheets = await readXlsxSheets(buf);
    const merged: ExtractionResult = { movements: [], balanceCents: null, warnings: [] };
    for (const rows of sheets) {
      const r = extractFromRows(rows);
      if (!r.movements.length && r.balanceCents === null) continue;
      merged.movements.push(...r.movements);
      merged.warnings.push(...r.warnings);
      merged.balanceCents = r.balanceCents ?? merged.balanceCents;
    }
    if (!merged.movements.length) merged.warnings.push("Nenhuma planilha com colunas de data e valor reconhecíveis.");
    return { engine: "xlsx", result: merged, text: sheets.flatMap((s) => s.slice(0, 40).flat()).join(" ") };
  }
  if (mime === "application/pdf") {
    const lines = await readPdfLines(buf);
    if (!lines.length) throw new Error("PDF sem texto selecionável (possivelmente digitalizado).");
    return { engine: "pdf", result: extractFromLines(lines), text: lines.slice(0, 120).join(" ") };
  }
  throw new Error("Formato sem leitura automática.");
}

function buildSummary(
  engine: ExtractionSummary["engine"],
  result: ExtractionResult,
  text: string,
  declaredPlatform: string | null,
): ExtractionSummary {
  const deposits = result.movements.filter((m) => m.type === "deposit");
  const withdrawals = result.movements.filter((m) => m.type === "withdrawal");
  const times = result.movements
    .map((m) => m.occurredAt?.getTime())
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);
  const start = times[0] ?? null;
  const end = times[times.length - 1] ?? null;
  const coveredDays = start !== null && end !== null ? Math.round((end - start) / 86_400_000) + 1 : null;
  const warnings = [...result.warnings];
  if (!result.movements.length) warnings.push("Nenhum depósito ou saque identificado automaticamente.");
  if (coveredDays !== null && coveredDays < 330) {
    const months = Math.max(1, Math.round(coveredDays / 30));
    warnings.push(`Histórico cobre cerca de ${months} ${months === 1 ? "mês" : "meses"} (solicitado: 12 meses).`);
  }
  const detectedPlatform = detectPlatformName(text);
  if (detectedPlatform && declaredPlatform && plain(detectedPlatform) !== plain(declaredPlatform)) {
    warnings.push(`Plataforma identificada no arquivo (${detectedPlatform}) difere da informada (${declaredPlatform}).`);
  }
  const sum = (list: typeof deposits) => list.reduce((acc, m) => acc + m.amountCents, 0);
  return {
    engine,
    deposits: { count: deposits.length, totalCents: sum(deposits) },
    withdrawals: { count: withdrawals.length, totalCents: sum(withdrawals) },
    balanceCents: result.balanceCents,
    periodStart: start !== null ? new Date(start).toISOString() : null,
    periodEnd: end !== null ? new Date(end).toISOString() : null,
    coveredDays,
    detectedPlatform,
    statedTotals: result.statedTotals,
    warnings,
  };
}

/** Lê um documento e grava as movimentações encontradas (origem "auto"). */
export async function processDocument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc?.caseId) return;
  const caseId = doc.caseId;
  // O ComprovaBet é sempre aprovado pela equipe; a leitura de movimentações não muda o status dele.
  const flagManual = doc.status === "pending" && doc.category !== "comprovabet" ? { status: "manual_review" as const } : {};

  if (doc.mimeType.startsWith("image/")) {
    await prisma.document.update({ where: { id: doc.id }, data: { extractionStatus: "unsupported", ...flagManual } });
    return;
  }

  await prisma.document.update({ where: { id: doc.id }, data: { extractionStatus: "processing", extractionError: null } });
  try {
    const storage = await getStorage();
    const buf = await storage.get(doc.storageKey);
    const { engine, result, text } = await extractFromBuffer(buf, doc.mimeType);
    const summary = buildSummary(engine, result, text, doc.platformName);
    await prisma.$transaction([
      prisma.documentTransaction.deleteMany({ where: { documentId: doc.id, source: "auto" } }),
      prisma.documentTransaction.createMany({
        data: result.movements.slice(0, 5000).map((m) => ({
          documentId: doc.id,
          caseId,
          occurredAt: m.occurredAt,
          type: m.type,
          amount: centsToDecimal(m.amountCents),
          description: m.description,
          source: "auto" as const,
          confidence: m.confidence,
        })),
      }),
      prisma.document.update({
        where: { id: doc.id },
        data: {
          extractionStatus: "done",
          extractedSummary: summary as unknown as Prisma.InputJsonValue,
          ...(result.movements.length === 0 ? flagManual : {}),
        },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    // PDF digitalizado (sem texto) é esperado: fica para a conferência manual, sem alarme de erro.
    if (/sem texto selecion/i.test(message)) console.warn("[extraction] documento sem texto para leitura automática", doc.id);
    else console.error("[extraction] falha ao ler documento", doc.id, message);
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        extractionStatus: "failed",
        extractionError: error instanceof Error ? error.message.slice(0, 300) : "Erro desconhecido",
        ...flagManual,
      },
    });
  }
}

/**
 * Marca movimentações repetidas entre arquivos (ex.: o mesmo depósito no histórico de depósitos
 * e no histórico completo) e recalcula o VALOR IDENTIFICADO automático do caso.
 * Nunca altera o valor validado e não sobrescreve valores conferidos manualmente (salvo force).
 */
export async function recomputeCaseIdentified(caseId: string, opts: { force?: boolean } = {}): Promise<void> {
  const current = await prisma.case.findUnique({ where: { id: caseId }, select: { identifiedSource: true } });
  if (!current) return;

  const docs = await prisma.document.findMany({
    where: { caseId, status: { notIn: ["illegible", "duplicate"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      platformName: true,
      extractedSummary: true,
      transactions: { where: { type: { in: ["deposit", "withdrawal"] } }, select: { id: true, type: true, amount: true, occurredAt: true } },
    },
  });

  // Chave: plataforma + tipo + dia + valor. Mantém as ocorrências do arquivo mais completo.
  const groups = new Map<string, Map<string, string[]>>();
  for (const doc of docs) {
    for (const t of doc.transactions) {
      const day = t.occurredAt ? t.occurredAt.toISOString().slice(0, 10) : "sem-data";
      const key = `${plain(doc.platformName ?? "")}|${t.type}|${day}|${decimalToCents(t.amount)}`;
      const byDoc = groups.get(key) ?? new Map<string, string[]>();
      byDoc.set(doc.id, [...(byDoc.get(doc.id) ?? []), t.id]);
      groups.set(key, byDoc);
    }
  }
  const duplicateIds: string[] = [];
  for (const byDoc of groups.values()) {
    let keep: string | null = null;
    let max = -1;
    for (const [docId, ids] of byDoc) {
      if (ids.length > max) {
        max = ids.length;
        keep = docId;
      }
    }
    for (const [docId, ids] of byDoc) if (docId !== keep) duplicateIds.push(...ids);
  }
  const duplicates = new Set(duplicateIds);

  let depositsCents = 0;
  let withdrawalsCents = 0;
  let count = 0;
  for (const doc of docs) {
    for (const t of doc.transactions) {
      if (duplicates.has(t.id)) continue;
      const cents = decimalToCents(t.amount) ?? 0;
      if (t.type === "deposit") depositsCents += cents;
      else withdrawalsCents += cents;
      count++;
    }
  }

  // Saldo: último saldo lido por plataforma.
  const latestBalance = new Map<string, { end: string; cents: number }>();
  for (const doc of docs) {
    const summary = doc.extractedSummary as unknown as ExtractionSummary | null;
    if (!summary || summary.balanceCents === null || summary.balanceCents === undefined) continue;
    const platform = plain(doc.platformName ?? "");
    const end = summary.periodEnd ?? "";
    const prev = latestBalance.get(platform);
    if (!prev || end >= prev.end) latestBalance.set(platform, { end, cents: summary.balanceCents });
  }
  const balanceCents = [...latestBalance.values()].reduce((acc, b) => acc + b.cents, 0);

  await prisma.$transaction([
    prisma.documentTransaction.updateMany({ where: { caseId, isDuplicate: true }, data: { isDuplicate: false } }),
    prisma.documentTransaction.updateMany({ where: { id: { in: [...duplicates] } }, data: { isDuplicate: true } }),
  ]);

  if (current.identifiedSource === "manual" && !opts.force) return;
  const hasData = count > 0;
  await prisma.case.update({
    where: { id: caseId },
    data: hasData
      ? {
          identifiedDeposits: centsToDecimal(depositsCents),
          identifiedWithdrawals: centsToDecimal(withdrawalsCents),
          identifiedBalance: centsToDecimal(balanceCents),
          identifiedLoss: centsToDecimal(Math.max(0, depositsCents - withdrawalsCents - balanceCents)),
          identifiedSource: "auto",
        }
      : { identifiedDeposits: null, identifiedWithdrawals: null, identifiedBalance: null, identifiedLoss: null, identifiedSource: null },
  });
}

/** Processa os documentos ainda não lidos de um caso e recalcula o valor identificado. */
export async function processCaseDocuments(caseId: string): Promise<void> {
  const docs = await prisma.document.findMany({
    where: { caseId, extractionStatus: "not_started" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const doc of docs) await processDocument(doc.id);
  await recomputeCaseIdentified(caseId);
}
