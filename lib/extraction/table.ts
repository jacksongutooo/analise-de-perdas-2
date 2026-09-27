import { classifyMovement, isFailedStatus, parseAmountCell, parseDateCell, plain } from "./normalize";

export type ExtractedMovement = {
  occurredAt: Date | null;
  type: "deposit" | "withdrawal";
  amountCents: number;
  description: string;
  confidence: number;
};

export type ExtractionResult = {
  movements: ExtractedMovement[];
  balanceCents: number | null;
  warnings: string[];
  statedTotals?: { depositsCents?: number; withdrawalsCents?: number };
};

const HEADER = {
  date: /^(data|date|dia|horario|timestamp|criado|created|data\/hora|data e hora)/,
  amount: /^(valor|amount|quantia|montante|value|importe)/,
  status: /^(status|situacao|estado|state)/,
  balance: /^(saldo|balance)/,
  text: /^(tipo|type|transacao|transaction|operacao|movimento|movimentacao|categoria|category|descricao|description|historico|detalhe|details|metodo|method)/,
};

/** Lê linhas de CSV/XLSX: encontra o cabeçalho e extrai depósitos e saques concluídos. */
export function extractFromRows(rows: unknown[][]): ExtractionResult {
  let headerIndex = -1;
  let found: { date: number; amount: number; status: number; balance: number; text: number[] } | null = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = (rows[i] ?? []).map((cell) => plain(String(cell ?? "")).trim());
    const date = cells.findIndex((c) => HEADER.date.test(c));
    const amount = cells.findIndex((c) => HEADER.amount.test(c));
    if (date < 0 || amount < 0) continue;
    headerIndex = i;
    found = {
      date,
      amount,
      status: cells.findIndex((c) => HEADER.status.test(c)),
      balance: cells.findIndex((c) => HEADER.balance.test(c)),
      text: cells.flatMap((c, idx) => (HEADER.text.test(c) ? [idx] : [])),
    };
    break;
  }
  if (!found) return { movements: [], balanceCents: null, warnings: ["Colunas de data e valor não reconhecidas."] };
  const cols = found;

  const collected: (ExtractedMovement & { dated: boolean })[] = [];
  let latestBalance: { at: number; cents: number } | null = null;
  let ignoredByStatus = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (!Array.isArray(row) || row.every((cell) => String(cell ?? "").trim() === "")) continue;
    const textCells = cols.text.length
      ? cols.text.map((i) => row[i])
      : row.filter((_, i) => i !== cols.amount && i !== cols.balance && i !== cols.date);
    const text = textCells
      .map((cell) => String(cell ?? ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (/\btota(l|is)\b/.test(plain(text))) continue;

    const date = parseDateCell(row[cols.date]);
    if (cols.balance >= 0 && date) {
      const balance = parseAmountCell(row[cols.balance]);
      if (balance !== null && (!latestBalance || date.getTime() >= latestBalance.at)) {
        latestBalance = { at: date.getTime(), cents: balance };
      }
    }
    const amount = parseAmountCell(row[cols.amount]);
    if (amount === null || amount === 0) continue;
    const type = classifyMovement(text);
    if (type === "other") continue;
    if (cols.status >= 0 && isFailedStatus(String(row[cols.status] ?? ""))) {
      ignoredByStatus++;
      continue;
    }
    collected.push({
      occurredAt: date,
      type,
      amountCents: Math.abs(amount),
      description: text.slice(0, 140),
      confidence: cols.text.length ? 0.8 : 0.6,
      dated: date !== null,
    });
  }

  // Linhas sem data em tabelas datadas costumam ser totais/resumos: ficam de fora.
  const anyDated = collected.some((m) => m.dated);
  const movements = (anyDated ? collected.filter((m) => m.dated) : collected).map(({ dated: _dated, ...m }) => m);
  const warnings: string[] = [];
  if (!anyDated && collected.length) warnings.push("Datas das movimentações não reconhecidas.");
  if (ignoredByStatus) {
    warnings.push(
      `${ignoredByStatus} ${ignoredByStatus === 1 ? "movimentação ignorada" : "movimentações ignoradas"} por status cancelado, pendente ou recusado.`,
    );
  }
  return { movements, balanceCents: latestBalance ? Math.max(0, latestBalance.cents) : null, warnings };
}
