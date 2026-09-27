import { classifyMovement, firstAmountInText, isFailedStatus, parseDateText, plain } from "./normalize";
import type { ExtractedMovement, ExtractionResult } from "./table";

const MOVEMENT_WORD = /\b(deposit\w*|depositos?|saques?|withdraw\w*|retiradas?|recargas?)\b/;

/** Leitura heurística de linhas de texto (PDF). Confiança menor que a de planilhas. */
export function extractFromLines(lines: string[]): ExtractionResult {
  const movements: ExtractedMovement[] = [];
  const statedTotals: { depositsCents?: number; withdrawalsCents?: number } = {};
  let balanceCents: number | null = null;
  let lastDate: Date | null = null;
  let lastDateLine = -10;
  let ignoredByStatus = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const date = parseDateText(line);
    if (date) {
      lastDate = date;
      lastDateLine = i;
    }
    const lower = plain(line);
    const amount = firstAmountInText(line);
    if (amount === null || amount === 0) continue;

    if (/\bsaldo (atual|disponivel|final|em conta)\b/.test(lower)) {
      balanceCents = Math.max(0, amount);
      continue;
    }
    if (/\b(saldo|limites?)\b/.test(lower)) continue;

    if (!MOVEMENT_WORD.test(lower)) continue;
    if (/\btota(l|is)\b/.test(lower)) {
      const totalType = classifyMovement(line);
      if (totalType === "deposit") statedTotals.depositsCents = Math.abs(amount);
      else if (totalType === "withdrawal") statedTotals.withdrawalsCents = Math.abs(amount);
      continue;
    }
    // Status antes da classificação: "Saque cancelado" conta como ignorado, não como estorno.
    if (isFailedStatus(line)) {
      ignoredByStatus++;
      continue;
    }
    const type = classifyMovement(line);
    if (type === "other") continue;
    const occurredAt = date ?? (lastDate && i - lastDateLine <= 2 ? lastDate : null);
    movements.push({
      occurredAt,
      type,
      amountCents: Math.abs(amount),
      description: line.slice(0, 140),
      confidence: date ? 0.55 : 0.4,
    });
  }

  const warnings: string[] = [];
  if (ignoredByStatus) {
    warnings.push(
      `${ignoredByStatus} ${ignoredByStatus === 1 ? "movimentação ignorada" : "movimentações ignoradas"} por status cancelado, pendente ou recusado.`,
    );
  }
  return { movements, balanceCents, warnings, statedTotals };
}
