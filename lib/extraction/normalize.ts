// Regras de leitura automática. Tudo que sai daqui é "extraído automaticamente — necessita validação".
import { parseMoneyToCents } from "@/lib/format";

export type MovementKind = "deposit" | "withdrawal" | "other";

export function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const BONUS = /\b(bonus|freebet|free bet|rodadas? (gratis|gratuitas?)|cashback|promocao|promocional)\b/;
const REVERSAL = /\b(estorn\w*|reembols\w*|chargeback|revers\w*|cancel\w*)\b/;
const WITHDRAWAL = /\b(saques?|withdraw\w*|retiradas?)\b/;
const DEPOSIT = /\b(depositos?|deposits?|deposited|recargas?)\b/;
const FAILED_STATUS =
  /\b(cancel\w*|recusad\w*|rejeitad\w*|reject\w*|declin\w*|negad\w*|falh\w*|fail\w*|erro|error|expirad\w*|expired|pendente|pending|em processamento|processing|aguardando|estornad\w*|revers\w*|refund\w*|reembols\w*)\b/;

/** Classifica uma linha/descrição como depósito, saque ou outro (apostas, bônus, estornos...). */
export function classifyMovement(text: string): MovementKind {
  const t = plain(text);
  if (BONUS.test(t) || REVERSAL.test(t)) return "other";
  if (WITHDRAWAL.test(t)) return "withdrawal";
  if (DEPOSIT.test(t)) return "deposit";
  return "other";
}

export function isFailedStatus(text: string): boolean {
  return FAILED_STATUS.test(plain(text));
}

// Datas: dd/mm/aaaa (padrão brasileiro), aaaa-mm-dd e mm/dd/aaaa quando inequívoco.
const ISO_WITH_ZONE = /\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})/;
const YMD = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DMY = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

function buildDate(y: number, month: number, day: number, h?: string, mi?: string, s?: string): Date | null {
  if (y < 2000 || y > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(y, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  // Horário de Brasília (UTC-3). Sem horário, usamos meio-dia para não trocar de dia.
  const hour = h !== undefined ? Number(h) : 12;
  return new Date(Date.UTC(y, month - 1, day, hour + 3, mi !== undefined ? Number(mi) : 0, s !== undefined ? Number(s) : 0));
}

export function parseDateText(text: string): Date | null {
  const iso = ISO_WITH_ZONE.exec(text);
  if (iso) {
    const d = new Date(iso[0]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const ymd = YMD.exec(text);
  if (ymd) return buildDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), ymd[4], ymd[5], ymd[6]);
  const dmy = DMY.exec(text);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const [day, month] = a <= 12 && b > 12 ? [b, a] : [a, b];
    return buildDate(year, month, day, dmy[4], dmy[5], dmy[6]);
  }
  return null;
}

export function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Número de série do Excel (dias desde 30/12/1899).
    if (value > 30000 && value < 80000) return new Date(Math.round((value - 25569) * 86_400_000));
    return null;
  }
  return typeof value === "string" ? parseDateText(value) : null;
}

export function parseAmountCell(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/brl|r\$/gi, "").trim();
  return cleaned ? parseMoneyToCents(cleaned) : null;
}

const DATE_ANYWHERE = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g;
const TIME_ANYWHERE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const AMOUNT = /(R\$\s*)?(-\s*)?\(?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\)?(?!\d)/g;

/** Primeiro valor monetário de uma linha de texto (prefere valores com "R$"). */
export function firstAmountInText(line: string): number | null {
  const clean = line.replace(DATE_ANYWHERE, " ").replace(TIME_ANYWHERE, " ");
  const matches = [...clean.matchAll(AMOUNT)];
  if (!matches.length) return null;
  const chosen = matches.find((m) => m[1]) ?? matches[0];
  if (!chosen?.[3]) return null;
  const cents = parseMoneyToCents(chosen[3]);
  if (cents === null) return null;
  const negative = Boolean(chosen[2]) || chosen[0].includes("(");
  return negative ? -cents : cents;
}

const KNOWN_PLATFORMS: [RegExp, string][] = [
  [/\bbetano\b/, "Betano"],
  [/\bbet ?365\b/, "Bet365"],
  [/\bkto\b/, "KTO"],
  [/\bsuperbet\b/, "Superbet"],
  [/\bbetnacional\b/, "Betnacional"],
  [/\bsportingbet\b/, "Sportingbet"],
  [/\bblaze\b/, "Blaze"],
  [/\bestrela ?bet\b/, "EstrelaBet"],
  [/\bnovibet\b/, "Novibet"],
  [/\bpixbet\b/, "Pixbet"],
  [/\besportes da sorte\b/, "Esportes da Sorte"],
  [/\bbetfair\b/, "Betfair"],
  [/\bvai ?de ?bet\b/, "VaiDeBet"],
  [/\b1xbet\b/, "1xBet"],
  [/\bparimatch\b/, "Parimatch"],
];

export function detectPlatformName(text: string): string | null {
  const t = plain(text);
  for (const [pattern, name] of KNOWN_PLATFORMS) if (pattern.test(t)) return name;
  return null;
}
